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
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";

import { S } from "../core/settings.js";
import { whenReady } from "../core/gpuUtil.js";
import { CASCADE_COUNT } from "../render/shadows.js";

const _screen = new Vector3();

const PALETTE = {
    rock: { albedo: new Color3(0.075, 0.090, 0.115), snow: 0.48, noise: 0.72 },
    tree: { albedo: new Color3(0.045, 0.105, 0.095), snow: 0.26, noise: 1.1 },
    wood: { albedo: new Color3(0.16, 0.095, 0.060), snow: 0.62, noise: 0.95 },
    cloth: { albedo: new Color3(0.62, 0.19, 0.055), snow: 0.10, noise: 1.6 },
    snow: { albedo: new Color3(0.58, 0.68, 0.78), snow: 0.82, noise: 1.8 },
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
        subdivisions: 2,
    }, scene);
    const yaw = (seed * 1.71) % (Math.PI * 2);
    return baked(m, x, y, z, new Vector3(sx, sy, sz), new Vector3(0, yaw, seed * 0.33));
}

function pine(scene, x, y, z, height, seed) {
    const parts = [];
    const trunk = MeshBuilder.CreateCylinder("juniperTrunk", {
        diameterTop: 0.18,
        diameterBottom: 0.34,
        height: height * 0.62,
        tessellation: 10,
    }, scene);
    parts.push(baked(trunk, x, y + height * 0.31, z));

    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
        const t = i / (tiers - 1);
        const cone = MeshBuilder.CreateCylinder("juniperBough", {
            diameterTop: 0.08,
            diameterBottom: height * (0.28 - t * 0.045),
            height: height * (0.28 - t * 0.025),
            tessellation: 9,
        }, scene);
        const sway = Math.sin(seed * 3.1 + i * 1.7) * 0.08;
        parts.push(baked(
            cone,
            x + sway * (1 - t),
            y + height * (0.38 + t * 0.42),
            z + Math.cos(seed + i) * 0.06,
            new Vector3(1, 1, 1),
            new Vector3(0, seed * 0.45, 0)
        ));
    }
    return parts;
}

function box(scene, name, x, y, z, sx, sy, sz, rotationY = 0) {
    const m = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
    return baked(m, x, y, z, new Vector3(1, 1, 1), new Vector3(0, rotationY, 0));
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
        this._depthMaterial = null;
        this._shadowMaterials = [];
        this.triangles = 0;

        this._build();
    }

    _build() {
        const scene = this.scene;
        const rocks = [];
        const trees = [];
        const wood = [];
        const cloth = [];
        const snow = [];

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
            if (i < 6) {
                rocks.push(rock(scene, p[0] + 2.2, y + 0.4, p[2] + 1.4, p[3] * 0.45, p[4] * 0.38, p[5] * 0.50, i + 9));
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
            trees.push(...pine(scene, x, y, z, h, i + 0.4));
        });

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

        // Cairns punctuate the route with a human-scale rhythm.
        for (let i = 0; i < 7; i++) {
            const x = -8 + i * 8.5;
            const z = 28 + (i % 2) * 10;
            const y = this.terrain.heightAt(x, z);
            for (let k = 0; k < 3 + (i % 2); k++) {
                rocks.push(rock(scene, x + Math.sin(k * 2.2 + i) * 0.16, y + 0.35 + k * 0.42, z, 0.82 - k * 0.13, 0.26, 0.66 - k * 0.10, 50 + i * 4 + k));
            }
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
        this._addMerged(merge(scene, trees, "environmentPines"), "tree");
        this._addMerged(merge(scene, wood, "environmentShrine"), "wood");
        this._addMerged(merge(scene, snow, "environmentSnowPillows"), "snow");

        for (const f of this.flags) {
            for (const key of ["pole", "cloth"]) {
                if (f[key] && !this.meshes.includes(f[key])) this._register(f[key], key === "cloth" ? "cloth" : "wood");
            }
        }
    }

    _material(kind) {
        const p = PALETTE[kind];
        const m = new ShaderMaterial(
            "environment-" + kind,
            this.scene,
            { vertex: "environment", fragment: "environment" },
            {
                attributes: ["position", "normal"],
                uniforms: [
                    "viewProjection", "cameraPos", "sunDir", "sunRadiance", "shR",
                    "albedo", "snowTint", "snowAmount", "roughness", "noiseScale", "fogDensity",
                    "time", "windAmount",
                ],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        m.backFaceCulling = kind !== "cloth";
        m.setColor3("albedo", p.albedo);
        m.setColor3("snowTint", new Color3(0.76, 0.84, 0.93));
        m.setFloat("snowAmount", p.snow);
        m.setFloat("roughness", kind === "cloth" ? 0.68 : 0.86);
        m.setFloat("noiseScale", p.noise);
        m.setFloat("windAmount", kind === "cloth" ? 0.028 : 0.0);
        this.materials.push(m);
        return m;
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

    update(time) {
        // Shared uniforms are published once per frame per material.
        for (const m of this.materials) {
            m.setVector3("cameraPos", this.scene.activeCamera.position);
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
        this._depthMaterial?.dispose();
    }
}
