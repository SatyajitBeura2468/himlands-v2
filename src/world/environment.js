/**
 * The living world around the wanderer.
 *
 * The terrain is intentionally open and procedural. This layer gives the eye
 * a readable foreground, mid-ground and landmark rhythm without replacing the
 * snow renderer: every prop is baked to world space, shaded through the same
 * sunrise radiance, and participates in the custom depth/shadow passes.
 */

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";

import { S } from "../core/settings.js";
import { whenReady } from "../core/gpuUtil.js";
import { PLAY_RADIUS } from "../terrain/heightfield.js";

import rockAlbedoUrl from "../assets/world/rock-diff.jpg";
import rockNormalUrl from "../assets/world/rock-normal.jpg";
import rockRoughUrl from "../assets/world/rock-rough.jpg";
import woodAlbedoUrl from "../assets/world/wood-diff.jpg";
import woodNormalUrl from "../assets/world/wood-normal.jpg";
import woodRoughUrl from "../assets/world/wood-rough.jpg";
import barkAlbedoUrl from "../assets/world/bark-diff.jpg";
import barkNormalUrl from "../assets/world/bark-normal.jpg";
import barkRoughUrl from "../assets/world/bark-rough.jpg";
import groundAlbedoUrl from "../assets/world/ground-diff.jpg";
import groundNormalUrl from "../assets/world/ground-normal.jpg";
import groundRoughUrl from "../assets/world/ground-rough.jpg";

const PALETTE = {
    rock: { albedo: new Color3(0.18, 0.20, 0.24), snow: 0.54, noise: 0.72, scale: 1.35, texture: "rock" },
    tree: { albedo: new Color3(0.16, 0.25, 0.19), snow: 0.32, noise: 1.1, scale: 2.6, texture: "bark" },
    foliage: { albedo: new Color3(0.075, 0.18, 0.105), snow: 0.38, noise: 1.65, scale: 4.8, texture: "ground" },
    wood: { albedo: new Color3(0.35, 0.22, 0.12), snow: 0.68, noise: 0.95, scale: 1.8, texture: "wood" },
    cloth: { albedo: new Color3(0.62, 0.19, 0.055), snow: 0.10, noise: 1.6, scale: 2.0, texture: "wood" },
    snow: { albedo: new Color3(0.78, 0.84, 0.90), snow: 0.90, noise: 1.8, scale: 2.0, texture: "ground" },
    grass: { albedo: new Color3(0.48, 0.39, 0.17), snow: 0.20, noise: 2.2, scale: 3.0, texture: "ground" },
    bush: { albedo: new Color3(0.10, 0.28, 0.21), snow: 0.38, noise: 1.35, scale: 2.4, texture: "ground" },
    tundra: { albedo: new Color3(0.26, 0.34, 0.25), snow: 0.50, noise: 1.5, scale: 2.8, texture: "ground" },
};

const TEXTURE_URLS = {
    rock: [rockAlbedoUrl, rockNormalUrl, rockRoughUrl],
    wood: [woodAlbedoUrl, woodNormalUrl, woodRoughUrl],
    bark: [barkAlbedoUrl, barkNormalUrl, barkRoughUrl],
    ground: [groundAlbedoUrl, groundNormalUrl, groundRoughUrl],
};

function baked(mesh, x, y, z, scale = null, rotation = null) {
    mesh.position.set(x, y, z);
    if (scale) mesh.scaling.copyFrom(scale);
    if (rotation) mesh.rotation.copyFrom(rotation);
    mesh.bakeCurrentTransformIntoVertices();
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scaling.set(1, 1, 1);
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 1;
    return mesh;
}

function rock(scene, x, y, z, sx, sy, sz, seed) {
    const m = MeshBuilder.CreateIcoSphere("slateOutcrop", {
        radius: 1,
        subdivisions: 3,
    }, scene);
    const yaw = (seed * 1.71) % (Math.PI * 2);
    return baked(m, x, y, z, new Vector3(sx, sy, sz), new Vector3(0, yaw, seed * 0.33));
}

function pine(scene, x, y, z, height, seed) {
    const trunkParts = [];
    const foliageParts = [];
    const trunk = MeshBuilder.CreateCylinder("juniperTrunk", {
        diameterTop: 0.18,
        diameterBottom: 0.34,
        height: height * 0.62,
        tessellation: 16,
    }, scene);
    trunkParts.push(baked(trunk, x, y + height * 0.31, z));

    const tiers = 8;
    for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const cone = MeshBuilder.CreateCylinder("juniperBough", {
            diameterTop: 0.08,
            diameterBottom: height * (0.30 - t * 0.035),
            height: height * (0.20 - t * 0.010),
            tessellation: 14,
        }, scene);
        const sway = Math.sin(seed * 3.1 + i * 1.7) * 0.08;
        foliageParts.push(baked(
            cone,
            x + sway * (1 - t),
            y + height * (0.38 + t * 0.42),
            z + Math.cos(seed + i) * 0.06,
            new Vector3(1, 1, 1),
            new Vector3(0, seed * 0.45, 0)
        ));
    }
    return { trunkParts, foliageParts };
}

function box(scene, name, x, y, z, sx, sy, sz, rotationY = 0) {
    const m = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
    return baked(m, x, y, z, new Vector3(1, 1, 1), new Vector3(0, rotationY, 0));
}

function grassCluster(scene, x, y, z, height, seed) {
    const parts = [];
    for (let i = 0; i < 8; i++) {
        const blade = MeshBuilder.CreatePlane("alpineGrass", {
            width: 0.10 + (i % 2) * 0.045,
            height: height * (0.74 + (i % 3) * 0.12),
            sideOrientation: 2,
        }, scene);
        const yaw = seed * 0.8 + i * (Math.PI / 5);
        parts.push(baked(
            blade,
            x + Math.cos(yaw) * (0.08 + i * 0.025),
            y + height * (0.37 + (i % 2) * 0.06),
            z + Math.sin(yaw) * (0.08 + i * 0.025),
            new Vector3(1, 1, 1),
            new Vector3(0, yaw, 0)
        ));
    }
    return parts;
}

function shrubCluster(scene, x, y, z, scale, seed, name = "tundraShrub") {
    const parts = [];
    for (let i = 0; i < 3; i++) {
        const m = MeshBuilder.CreateIcoSphere(name, { radius: 1, subdivisions: 2 }, scene);
        const yaw = seed * 1.37 + i * 2.1;
        parts.push(baked(
            m,
            x + Math.cos(yaw) * scale * 0.35,
            y + scale * (0.30 + i * 0.05),
            z + Math.sin(yaw) * scale * 0.35,
            new Vector3(scale * (0.75 + i * 0.14), scale * (0.52 + i * 0.10), scale * (0.68 + i * 0.12)),
            new Vector3(0, yaw, seed * 0.13)
        ));
    }
    return parts;
}

function merge(scene, meshes, name) {
    if (!meshes.length) return null;
    const merged = Mesh.MergeMeshes(meshes, true, true);
    if (!merged) return null;
    merged.name = name;
    merged.isPickable = false;
    merged.alwaysSelectAsActiveMesh = true;
    merged.renderingGroupId = 1;
    merged.metadata = { triangles: merged.getTotalIndices() / 3 };
    return merged;
}

export class Environment {
    constructor(scene, terrain, sky, shadows, depthPass) {
        this.scene = scene;
        this.terrain = terrain;
        this.sky = sky;
        this.shadows = shadows;
        this.depthPass = depthPass;
        this.meshes = [];
        this.flags = [];
        this.materials = [];
        this.colliders = [];
        this.contactPulse = 0;
        this.textureSets = new Map();
        this._depthMaterial = null;
        this.triangles = 0;

        this._build();
    }

    _build() {
        const scene = this.scene;
        const rocks = [];
        const trees = [];
        const foliage = [];
        const wood = [];
        const cloth = [];
        const snow = [];
        const grass = [];
        const bushes = [];
        const tundra = [];

        // Foreground anchors: enough asymmetry to make the opening camera feel
        // authored, while leaving a clean corridor for the character.
        const outcrops = [
            [-12, 0, 14, 3.8, 2.2, 2.7], [14, 0, 19, 4.5, 2.5, 3.0],
            [-22, 0, 38, 5.2, 3.4, 3.4], [24, 0, 48, 6.2, 4.3, 3.8],
            [-42, 0, 74, 8.0, 5.2, 4.8], [48, 0, 92, 8.5, 5.0, 5.4],
            [-68, 0, 122, 11, 7.0, 7.0], [70, 0, 138, 13, 8.0, 8.0],
        ];
        outcrops.forEach((p, i) => {
            const y = this.terrain.heightAt(p[0], p[2]);
            rocks.push(rock(scene, p[0], y + p[4] * 0.22, p[2], p[3], p[4], p[5], i + 1));
            this._collider(p[0], p[2], Math.max(p[3], p[5]) * 0.68, "outcrop");
            if (i < 6) {
                rocks.push(rock(scene, p[0] + 2.2, y + 0.4, p[2] + 1.4, p[3] * 0.45, p[4] * 0.38, p[5] * 0.50, i + 9));
                this._collider(p[0] + 2.2, p[2] + 1.4, Math.max(p[3], p[5]) * 0.28, "outcrop");
            }
        });

        // A staggered high-altitude juniper line frames the valley and gives
        // the sun something close enough to rim-light.
        const treeSpots = [
            [-34, 29], [-27, 42], [-39, 53], [-30, 67], [-54, 86],
            [32, 32], [39, 46], [31, 61], [52, 72], [59, 101],
            [-84, 132], [-69, 150], [78, 148], [96, 170],
        ];
        treeSpots.forEach((p, i) => {
            const x = p[0] + Math.sin(i * 4.1) * 2.5;
            const z = p[1] + Math.cos(i * 2.4) * 2.5;
            const h = 5.0 + (i % 4) * 0.9;
            const y = this.terrain.heightAt(x, z);
            const tree = pine(scene, x, y, z, h, i + 0.4);
            trees.push(...tree.trunkParts);
            foliage.push(...tree.foliageParts);
            this._collider(x, z, 0.72, "juniper");
        });

        // Full-radius ecology pass. The golden-angle distribution avoids rows
        // and keeps the world deterministic across every run and every machine.
        for (let i = 0; i < 176; i++) {
            const a = i * 2.399963 + Math.sin(i * 0.71) * 0.12;
            const r = 34 + (i % 19) * 30 + Math.sin(i * 1.37) * 8;
            const x = Math.cos(a) * Math.min(PLAY_RADIUS - 24, r);
            const z = Math.sin(a) * Math.min(PLAY_RADIUS - 24, r);
            const y = this.terrain.heightAt(x, z);
            grass.push(...grassCluster(scene, x, y + 0.01, z, 0.62 + (i % 5) * 0.14, i + 0.3));
            if (i % 2 === 0) bushes.push(...shrubCluster(scene, x + 1.2, y, z - 0.7, 0.55 + (i % 4) * 0.11, i + 8, "blueJuniper"));
            if (i % 5 === 0) tundra.push(...shrubCluster(scene, x - 1.4, y, z + 1.1, 0.72 + (i % 3) * 0.12, i + 19));
            if (i % 3 === 0) {
                const rx = x - 1.9;
                const rz = z + 1.4;
                const rockScale = 0.42 + (i % 4) * 0.12;
                rocks.push(rock(scene, rx, y + rockScale * 0.34, rz, rockScale * 1.25, rockScale * 0.72, rockScale, i + 320));
                // Small boulders now have their own player-scale colliders as
                // well; no more visual-only pebbles the character can ghost through.
                this._collider(rx, rz, rockScale * 0.82, "small boulder");
            }
            if (i % 7 === 0) {
                const tree = pine(scene, x + 2.2, y, z - 1.5, 3.8 + (i % 4) * 0.45, i + 70);
                trees.push(...tree.trunkParts);
                foliage.push(...tree.foliageParts);
                this._collider(x + 2.2, z - 1.5, 0.62, "juniper");
            }
        }

        // A looser outer ring reads as a living valley wall instead of a hard
        // prop boundary. These are smaller and lower contrast by design.
        for (let i = 0; i < 48; i++) {
            const a = i * 2.399963 + 0.4;
            const r = 360 + (i % 9) * 26;
            const x = Math.cos(a) * Math.min(PLAY_RADIUS - 10, r);
            const z = Math.sin(a) * Math.min(PLAY_RADIUS - 10, r);
            const y = this.terrain.heightAt(x, z);
            grass.push(...grassCluster(scene, x, y, z, 0.42 + (i % 4) * 0.08, i + 101));
            bushes.push(...shrubCluster(scene, x, y, z, 0.45 + (i % 3) * 0.08, i + 131, "blueJuniper"));
        }

        // Hilltop shrine, built from real boxes and a layered stone base. It is
        // a visual destination rather than a UI marker.
        const sx = 36, sz = 116, sy = this.terrain.heightAt(sx, sz);
        rocks.push(rock(scene, sx - 1.8, sy + 0.45, sz, 2.2, 0.9, 1.8, 31));
        rocks.push(rock(scene, sx + 1.5, sy + 0.52, sz + 0.5, 1.6, 0.82, 1.45, 32));
        wood.push(box(scene, "shrinePostL", sx - 1.35, sy + 2.1, sz, 0.26, 3.2, 0.26));
        wood.push(box(scene, "shrinePostR", sx + 1.35, sy + 2.1, sz, 0.26, 3.2, 0.26));
        wood.push(box(scene, "shrineBeam", sx, sy + 3.35, sz, 3.2, 0.25, 0.25));
        wood.push(box(scene, "shrineBack", sx, sy + 2.0, sz + 0.55, 2.75, 2.7, 0.18));
        const roofL = box(scene, "shrineRoofL", sx - 0.65, sy + 3.65, sz, 1.75, 0.18, 3.3, -0.14);
        const roofR = box(scene, "shrineRoofR", sx + 0.65, sy + 3.65, sz, 1.75, 0.18, 3.3, 0.14);
        wood.push(roofL, roofR);
        this._collider(sx, sz, 2.5, "shrine");

        // Cairns punctuate the route with a human-scale rhythm.
        for (let i = 0; i < 7; i++) {
            const x = -8 + i * 8.5;
            const z = 28 + (i % 2) * 10;
            const y = this.terrain.heightAt(x, z);
            for (let k = 0; k < 3 + (i % 2); k++) {
                rocks.push(rock(scene, x + Math.sin(k * 2.2 + i) * 0.16, y + 0.35 + k * 0.42, z, 0.82 - k * 0.13, 0.26, 0.66 - k * 0.10, 50 + i * 4 + k));
            }
            this._collider(x, z, 0.72, "cairn");
        }

        // Small buried snow pillows soften the prop bases and make them feel
        // seated in the field rather than dropped onto it.
        for (let i = 0; i < 16; i++) {
            const x = Math.sin(i * 9.1) * 46;
            const z = 18 + (i * 17) % 128;
            const y = this.terrain.heightAt(x, z);
            const m = MeshBuilder.CreateIcoSphere("snowPillow", { radius: 1, subdivisions: 2 }, scene);
            snow.push(baked(m, x, y + 0.16, z, new Vector3(1.6 + (i % 3) * 0.35, 0.32, 1.05 + (i % 4) * 0.2), new Vector3(0, i, 0)));
        }

        this._buildArtifacts(scene, wood, rocks, cloth);

        // Prayer cloth is deliberately sparse: warm colour in a cool world,
        // but never a neon billboard. These remain separate so wind can move
        // them without reallocating geometry.
        const flagSpots = [[sx - 2.0, sy + 2.9, sz + 0.2], [sx + 2.0, sy + 2.6, sz + 0.2], [-47, this.terrain.heightAt(-47, 72) + 2.5, 72]];
        flagSpots.forEach((p, i) => {
            const pole = MeshBuilder.CreateCylinder("prayerPole", { diameter: 0.06, height: 3.3, tessellation: 8 }, scene);
            const poleMesh = baked(pole, p[0], p[1] - 1.2, p[2]);
            poleMesh.material = this._material("wood");
            this.flags.push({ pole: poleMesh, phase: i * 1.8 });
            const flag = MeshBuilder.CreatePlane("prayerCloth", { width: 1.35, height: 0.64, sideOrientation: 2 }, scene);
            flag.rotation.y = Math.PI * 0.5;
            const flagMesh = baked(flag, p[0] + 0.62, p[1], p[2]);
            flagMesh.material = this._material("cloth");
            this.flags.push({ cloth: flagMesh, phase: i * 1.8 });
        });

        this._addMerged(merge(scene, rocks, "environmentRocks"), "rock");
        this._addMerged(merge(scene, trees, "environmentPineTrunks"), "tree");
        this._addMerged(merge(scene, foliage, "environmentPineFoliage"), "foliage");
        this._addMerged(merge(scene, wood, "environmentShrine"), "wood");
        this._addMerged(merge(scene, snow, "environmentSnowPillows"), "snow");
        this._addMerged(merge(scene, grass, "environmentGrass"), "grass");
        this._addMerged(merge(scene, bushes, "environmentBushes"), "bush");
        this._addMerged(merge(scene, tundra, "environmentTundra"), "tundra");
        this._addMerged(merge(scene, cloth, "environmentDistantCloth"), "cloth");

        for (const f of this.flags) {
            for (const key of ["pole", "cloth"]) {
                if (f[key] && !this.meshes.includes(f[key])) this._register(f[key], key === "cloth" ? "cloth" : "wood");
            }
        }
    }

    _buildArtifacts(scene, wood, rocks, cloth) {
        const sites = [
            [-208, 154], [238, 198], [-318, -86], [374, -238],
            [-458, 18], [492, 286], [-118, -362], [176, -432],
            [34, 508], [-514, -302],
        ];
        sites.forEach(([x, z], i) => {
            const y = this.terrain.heightAt(x, z);
            if (i % 4 === 0) {
                // A small timber shelter with a snow-heavy pitched roof.
                rocks.push(rock(scene, x - 1.8, y + 0.35, z, 2.1, 0.7, 1.5, 200 + i));
                rocks.push(rock(scene, x + 1.6, y + 0.42, z + 0.4, 1.7, 0.72, 1.2, 220 + i));
                wood.push(box(scene, "trailShelterPostA", x - 1.2, y + 1.85, z, 0.22, 2.7, 0.22));
                wood.push(box(scene, "trailShelterPostB", x + 1.2, y + 1.85, z, 0.22, 2.7, 0.22));
                wood.push(box(scene, "trailShelterBeam", x, y + 3.0, z, 2.8, 0.22, 0.22));
                wood.push(box(scene, "trailShelterRoofA", x - 0.55, y + 3.25, z, 1.55, 0.18, 2.8, -0.18));
                wood.push(box(scene, "trailShelterRoofB", x + 0.55, y + 3.25, z, 1.55, 0.18, 2.8, 0.18));
                this._collider(x, z, 2.4, "trail shelter");
            } else if (i % 4 === 1) {
                // A narrow footbridge / snow crossing: visual artifact and a
                // solid hand-built obstruction at its ends.
                for (let k = -3; k <= 3; k++) {
                    wood.push(box(scene, "bridgePlank", x + k * 0.58, y + 0.42, z, 0.48, 0.16, 3.0, 0.03 * Math.sin(k)));
                }
                wood.push(box(scene, "bridgeRailA", x, y + 1.05, z - 1.25, 4.4, 0.12, 0.12));
                wood.push(box(scene, "bridgeRailB", x, y + 1.05, z + 1.25, 4.4, 0.12, 0.12));
                this._collider(x - 2.3, z, 0.72, "bridge end");
                this._collider(x + 2.3, z, 0.72, "bridge end");
            } else if (i % 4 === 2) {
                // A half-buried supply sled, a small human trace in a very
                // large landscape.
                wood.push(box(scene, "sledBed", x, y + 0.48, z, 2.8, 0.20, 1.1, -0.08));
                wood.push(box(scene, "sledRail", x - 0.85, y + 0.24, z - 0.55, 3.3, 0.10, 0.10, -0.12));
                wood.push(box(scene, "sledRail", x - 0.85, y + 0.24, z + 0.55, 3.3, 0.10, 0.10, -0.12));
                this._collider(x, z, 1.55, "sled");
            } else {
                // Low stacked-stone wall and a prayer marker at its shoulder.
                for (let k = -3; k <= 3; k++) {
                    rocks.push(rock(scene, x + k * 0.72, y + 0.34 + (Math.abs(k) % 2) * 0.15, z, 0.62, 0.30, 0.40, 260 + i * 8 + k));
                }
                const pole = MeshBuilder.CreateCylinder("distantPrayerPole", { diameter: 0.07, height: 3.8, tessellation: 8 }, scene);
                wood.push(baked(pole, x + 2.5, y + 1.8, z));
                const marker = MeshBuilder.CreatePlane("distantPrayerCloth", { width: 1.4, height: 0.62, sideOrientation: 2 }, scene);
                cloth.push(baked(marker, x + 3.15, y + 2.8, z, null, new Vector3(0, Math.PI * 0.5, 0)));
                this._collider(x, z, 3.4, "stone wall");
            }
        });
    }

    _collider(x, z, radius, kind) {
        this.colliders.push({ x, z, radius, kind });
    }

    /**
     * Resolve the character's proposed horizontal movement against the authored
     * world. Props use cheap broad-phase circles, while the actual meshes remain
     * detailed and merged for rendering. Grass and shrubs intentionally have no
     * hard collider: the player passes through and the shader bends around them.
     */
    resolveMotion(current, next, velocity, dt, controller, rig) {
        let hit = false;
        for (const obstacle of this.colliders) {
            const min = obstacle.radius + 0.38;
            let dx = next.x - obstacle.x;
            let dz = next.z - obstacle.z;
            let dist = Math.hypot(dx, dz);
            if (dist >= min) continue;

            if (dist < 1e-4) {
                dx = current.x - obstacle.x;
                dz = current.z - obstacle.z;
                dist = Math.hypot(dx, dz) || 1;
            }
            dx /= dist;
            dz /= dist;
            next.x = obstacle.x + dx * (min + 0.04);
            next.z = obstacle.z + dz * (min + 0.04);
            velocity.x = 0;
            velocity.z = 0;
            hit = true;
            controller.registerImpact(dx, dz, rig);
        }
        this.contactPulse = hit ? 1 : Math.max(0, (this.contactPulse || 0) - dt * 3.5);
    }

    _material(kind) {
        const p = PALETTE[kind];
        const m = new ShaderMaterial(
            "environment-" + kind,
            this.scene,
            { vertex: "environment", fragment: "environment" },
            {
                attributes: ["position", "normal", "uv"],
                uniforms: [
                    "viewProjection", "cameraPos", "playerPos", "playerSpeed",
                    "sunDir", "sunRadiance", "shR",
                    "albedo", "snowTint", "snowAmount", "roughness", "noiseScale", "fogDensity",
                    "time", "windAmount", "interactionAmount", "textureScale",
                ],
                samplers: ["albedoTex", "normalTex", "roughTex"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        m.backFaceCulling = kind !== "cloth";
        m.setColor3("albedo", p.albedo);
        m.setColor3("snowTint", new Color3(0.76, 0.84, 0.93));
        m.setFloat("snowAmount", p.snow);
        m.setFloat("roughness", kind === "cloth" ? 0.68 : 0.86);
        m.setFloat("noiseScale", p.noise);
        m.setFloat("textureScale", p.scale);
        m.setFloat("windAmount", kind === "grass" ? 0.06 : kind === "cloth" ? 0.028 : kind === "bush" ? 0.008 : 0.0);
        m.setFloat("interactionAmount", kind === "grass" ? 1.0 : kind === "bush" ? 0.35 : 0.0);
        m.metadata = { environmentKind: kind };
        const textures = this._textureSet(p.texture);
        m.setTexture("albedoTex", textures.albedo);
        m.setTexture("normalTex", textures.normal);
        m.setTexture("roughTex", textures.rough);
        this.materials.push(m);
        return m;
    }

    _textureSet(kind) {
        const cached = this.textureSets.get(kind);
        if (cached) return cached;
        const [albedoUrl, normalUrl, roughUrl] = TEXTURE_URLS[kind];
        const make = (url, name) => {
            const tex = new Texture(
                url,
                this.scene,
                false,
                false,
                Constants.TEXTURE_TRILINEAR_SAMPLINGMODE
            );
            tex.name = "world-" + kind + "-" + name;
            tex.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
            tex.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
            tex.anisotropicFilteringLevel = 8;
            return tex;
        };
        const set = {
            albedo: make(albedoUrl, "albedo"),
            normal: make(normalUrl, "normal"),
            rough: make(roughUrl, "rough"),
        };
        this.textureSets.set(kind, set);
        return set;
    }

    _addMerged(mesh, kind) {
        if (!mesh) return;
        this._register(mesh, kind);
    }

    _register(mesh, kind) {
        const mat = this._material(kind);
        mesh.material = mat;
        this.meshes.push(mesh);
        this.triangles += mesh.metadata?.triangles || mesh.getTotalIndices() / 3;

        if (!this._depthMaterial) {
            this._depthMaterial = new ShaderMaterial(
                "environmentDepth",
                this.scene,
                { vertex: "environmentDepth", fragment: "prepass" },
                { attributes: ["position"], uniforms: ["viewProjection"], shaderLanguage: ShaderLanguage.WGSL }
            );
            this._depthMaterial.backFaceCulling = false;
        }
        this.depthPass.registerCaster(mesh, this._depthMaterial);

        // A compact shadow budget: the merged category meshes cast into all
        // three cascades; loose prayer cloth is intentionally depth-only.
        if (!kind.includes("cloth")) {
            this.shadows.registerCaster(mesh, (cascade) => {
                const shadow = new ShaderMaterial(
                    "environmentShadow" + cascade,
                    this.scene,
                    { vertex: "environmentShadow", fragment: "terrainDepth" },
                    { attributes: ["position"], uniforms: ["lightViewProjection"], shaderLanguage: ShaderLanguage.WGSL }
                );
                shadow.backFaceCulling = false;
                return shadow;
            });
        }
    }

    async warmUp() {
        for (const m of this.materials) {
            const mesh = this.meshes.find((item) => item.material === m);
            if (mesh) await whenReady(m, "environment:" + m.name, [mesh, false]);
        }
        await whenReady(this._depthMaterial, "environment depth");
    }

    update(time, character) {
        // Shared uniforms are published once per frame per material.
        for (const m of this.materials) {
            m.setVector3("cameraPos", this.scene.activeCamera.position);
            m.setVector3("playerPos", character.position);
            m.setFloat("playerSpeed", character.speed);
            m.setVector3("sunDir", this.sky.sunDir);
            m.setColor3("sunRadiance", this.sky.sunRadiance);
            m.setArray4("shR", this.sky.sh);
            m.setFloat("fogDensity", S.fogDensity);
            m.setFloat("time", time);
        }
    }

    dispose() {
        for (const mesh of this.meshes) mesh.dispose();
        for (const material of this.materials) material.dispose();
        for (const textures of this.textureSets.values()) {
            textures.albedo.dispose();
            textures.normal.dispose();
            textures.rough.dispose();
        }
        this._depthMaterial?.dispose();
    }
}
