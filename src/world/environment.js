/**
 * Dense alpine world production layer.
 *
 * Natural detail comes from locally bundled, high-resolution CC0 models and is
 * streamed in terrain cells. Hand-built trail artifacts remain deliberately
 * authored so the procedural valley has memorable destinations and navigation
 * rhythm instead of becoming an undifferentiated asset scatter.
 */

import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";

import { S } from "../core/settings.js";
import { whenReady } from "../core/gpuUtil.js";
import { AlpineAssetField } from "./alpineAssetField.js";
import { BIOME_CELL_SIZE, buildBiomeDistribution } from "./biomeDistribution.js";

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
    rock: { albedo: new Color3(0.72, 0.76, 0.82), snow: 0.58, noise: 0.72, scale: 1.35, texture: "rock" },
    tree: { albedo: new Color3(0.68, 0.72, 0.68), snow: 0.34, noise: 1.1, scale: 2.2, texture: "bark" },
    foliage: { albedo: new Color3(0.55, 0.72, 0.58), snow: 0.46, noise: 1.65, scale: 1.0, texture: "ground" },
    wood: { albedo: new Color3(0.82, 0.74, 0.66), snow: 0.66, noise: 0.95, scale: 1.4, texture: "wood" },
    cloth: { albedo: new Color3(0.78, 0.36, 0.18), snow: 0.10, noise: 1.6, scale: 1.0, texture: "wood" },
    snow: { albedo: new Color3(0.92, 0.96, 1.0), snow: 0.94, noise: 1.8, scale: 1.5, texture: "ground" },
    grass: { albedo: new Color3(0.72, 0.66, 0.42), snow: 0.24, noise: 2.2, scale: 1.0, texture: "ground" },
    bush: { albedo: new Color3(0.62, 0.78, 0.68), snow: 0.44, noise: 1.35, scale: 1.0, texture: "ground" },
    tundra: { albedo: new Color3(0.68, 0.72, 0.52), snow: 0.36, noise: 1.5, scale: 1.0, texture: "ground" },
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

function box(scene, name, x, y, z, sx, sy, sz, rotationY = 0) {
    const mesh = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, scene);
    return baked(mesh, x, y, z, null, new Vector3(0, rotationY, 0));
}

function timber(scene, name, x, y, z, length, radius, yaw = 0, horizontal = false) {
    const mesh = MeshBuilder.CreateCylinder(name, {
        height: length,
        diameterTop: radius * 1.72,
        diameterBottom: radius * 2,
        tessellation: 20,
        subdivisions: 2,
    }, scene);
    return baked(mesh, x, y, z, null, horizontal
        ? new Vector3(0, yaw, Math.PI * 0.5)
        : new Vector3(0, yaw, 0));
}

function stone(scene, x, y, z, sx, sy, sz, seed) {
    const mesh = MeshBuilder.CreateIcoSphere("handStackedStone", { radius: 1, subdivisions: 4 }, scene);
    return baked(
        mesh,
        x, y, z,
        new Vector3(sx, sy, sz),
        new Vector3(seed * 0.17, seed * 1.37, seed * 0.11)
    );
}

function merge(meshes, name) {
    if (!meshes.length) return null;
    const merged = Mesh.MergeMeshes(meshes, true, true);
    if (!merged) return null;
    merged.name = name;
    merged.isPickable = false;
    merged.alwaysSelectAsActiveMesh = true;
    merged.renderingGroupId = 1;
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
        this.materialMeshes = new Map();
        this.materialCache = new Map();
        this.nativeAssetMaterials = new Set();
        this.textureSets = new Map();
        this.colliders = [];
        this.softContacts = [];
        this.hardContactCells = new Map();
        this.softContactCells = new Map();
        this.contactPulse = 0;
        this._depthMaterial = null;
        this._shadowMaterials = [];
        this.assetField = null;
        this.triangles = 0;
        this.instanceCount = 0;
    }

    async build() {
        // The snow, character and effects retain their authored WGSL lighting.
        // These two lights exist only for the native PBR scan materials.
        this.assetFill = new HemisphericLight("alpineAssetFill", new Vector3(0, 1, 0), this.scene);
        this.assetFill.intensity = 0.72;
        this.assetFill.diffuse = new Color3(0.68, 0.76, 0.84);
        this.assetFill.groundColor = new Color3(0.13, 0.17, 0.22);
        this.assetSun = new DirectionalLight("alpineAssetSun", this.sky.sunDir.scale(-1), this.scene);
        this.assetSun.intensity = 2.15;
        this.assetSun.diffuse = new Color3(1.0, 0.89, 0.72);

        const distribution = buildBiomeDistribution(this.terrain);
        this.colliders.push(...distribution.hard);
        this.softContacts.push(...distribution.soft);

        this.assetField = new AlpineAssetField(this.scene, distribution, this);
        await this.assetField.build();
        this.instanceCount = this.assetField.instanceCount;

        this._buildLandmarks();
        this._buildContactIndex();
        this.assetField.update({ x: -2, z: 0 });
        console.info("[himlands] alpine world", {
            instances: this.instanceCount,
            hardContacts: this.colliders.length,
            walkableContacts: this.softContacts.length,
            assets: distribution.stats,
        });
    }

    _buildLandmarks() {
        const scene = this.scene;
        const wood = [];
        const rocks = [];
        const snow = [];
        const cloth = [];

        // Weathered log shelters. Each is built from round, tapered timbers and
        // individually overlapped roof boards rather than box silhouettes.
        const shelters = [
            [31.6, -62.6, 0.74],
            [-52, 92, 0.18], [148, 236, -0.52], [-258, 172, 0.74], [326, 286, -1.08],
            [-392, 44, 0.35], [438, -258, 1.22], [-112, -402, -0.68], [204, -486, 0.92],
        ];
        shelters.forEach(([x, z, yaw], index) => {
            const y = this.terrain.heightAt(x, z);
            const cos = Math.cos(yaw), sin = Math.sin(yaw);
            const local = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
            for (const [lx, lz] of [[-1.55, -1.1], [1.55, -1.1], [-1.55, 1.1], [1.55, 1.1]]) {
                const [px, pz] = local(lx, lz);
                wood.push(timber(scene, "shelterPost", px, y + 1.55, pz, 3.1, 0.15, yaw));
            }
            // Closely fitted round-log rear and side walls give the shelter a
            // believable occupied mass while keeping its downhill face open.
            for (let row = 0; row < 8; row++) {
                const wallY = y + 0.28 + row * 0.32;
                const [backX, backZ] = local(0, 1.08);
                wood.push(timber(scene, "shelterBackLog", backX, wallY, backZ, 3.18, 0.16, yaw, true));
                if (row < 6) {
                    for (const side of [-1, 1]) {
                        const [sideX, sideZ] = local(side * 1.48, 0);
                        wood.push(timber(scene, "shelterSideLog", sideX, wallY, sideZ, 2.08, 0.15, yaw + Math.PI * 0.5, true));
                    }
                }
            }
            wood.push(timber(scene, "shelterRidge", x, y + 3.2, z, 3.4, 0.15, yaw, true));
            for (let board = -7; board <= 7; board++) {
                const offset = board * 0.24;
                const [px, pz] = local(offset, 0);
                wood.push(box(scene, "roofBoard", px - sin * 0.7, y + 3.0, pz - cos * 0.7, 0.22, 0.11, 2.05, yaw - 0.34));
                wood.push(box(scene, "roofBoard", px + sin * 0.7, y + 3.0, pz + cos * 0.7, 0.22, 0.11, 2.05, yaw + 0.34));
            }
            const pillow = MeshBuilder.CreateIcoSphere("roofSnow", { radius: 1, subdivisions: 3 }, scene);
            snow.push(baked(pillow, x, y + 3.15, z, new Vector3(1.9, 0.22, 1.5), new Vector3(0, yaw, 0)));
            this._collider(x, z, 1.9, 1.55, yaw, "log shelter");

            // A small cairn and prayer marker turn each shelter into a site,
            // rather than a lone repeated hut asset.
            const cairnX = x + cos * 3.2;
            const cairnZ = z - sin * 3.2;
            for (let layer = 0; layer < 5; layer++) {
                rocks.push(stone(scene, cairnX, y + 0.18 + layer * 0.27, cairnZ,
                    0.58 - layer * 0.075, 0.16, 0.46 - layer * 0.055, index * 9 + layer));
            }
            this._collider(cairnX, cairnZ, 0.46, 0.42, 0, "cairn");
        });

        // Low dry-stone walls follow several trail shoulders. Irregular rows,
        // gaps and cap stones keep the silhouette from reading as a repeated box.
        const walls = [
            [16.7, -37.1, 0.86],
            [-18, 46, 0.12], [76, 118, -0.34], [-164, 286, 0.78], [262, 362, -0.62],
            [-352, -142, 0.25], [414, 86, 1.08], [-246, -384, -0.82], [84, -526, 0.46],
        ];
        walls.forEach(([x, z, yaw], wallIndex) => {
            const y = this.terrain.heightAt(x, z);
            const cos = Math.cos(yaw), sin = Math.sin(yaw);
            for (let row = 0; row < 3; row++) {
                const count = 10 - row;
                for (let i = 0; i < count; i++) {
                    const along = (i - (count - 1) * 0.5) * 0.64 + (row % 2) * 0.21;
                    const px = x + along * cos;
                    const pz = z - along * sin;
                    rocks.push(stone(scene, px, y + 0.18 + row * 0.34, pz,
                        0.36 + ((i + row) % 3) * 0.055, 0.19, 0.29, wallIndex * 41 + row * 11 + i));
                }
            }
            this._collider(x, z, 3.35, 0.48, yaw, "stone wall");
        });

        // Half-buried sleds, made from round runners, braces and lashed beds.
        const sleds = [[4.8, -16.6, 0.78], [22, 82, -0.18], [-124, 188, 0.52], [186, 328, -0.76], [-318, 248, 0.24], [368, -174, 1.12], [-82, -336, -0.44]];
        sleds.forEach(([x, z, yaw], index) => {
            const y = this.terrain.heightAt(x, z);
            const cos = Math.cos(yaw), sin = Math.sin(yaw);
            for (const side of [-0.55, 0.55]) {
                const px = x + side * -sin;
                const pz = z + side * cos;
                wood.push(timber(scene, "sledRunner", px, y + 0.18, pz, 3.4, 0.075, yaw, true));
            }
            for (let brace = -2; brace <= 2; brace++) {
                const along = brace * 0.56;
                wood.push(timber(scene, "sledBrace", x + along * cos, y + 0.46, z - along * sin, 1.38, 0.065, yaw + Math.PI * 0.5, true));
            }
            snow.push(baked(
                MeshBuilder.CreateIcoSphere("sledSnow", { radius: 1, subdivisions: 3 }, scene),
                x, y + 0.48, z,
                new Vector3(1.25, 0.16, 0.48),
                new Vector3(0, yaw, 0)
            ));
            this._collider(x, z, 1.62, 0.72, yaw, "supply sled");
            if (index % 2 === 0) this._buildPrayerMarker(x + 2.5, z + 1.2, y, yaw, wood, cloth);
        });

        // Opening shrine: it deliberately sits in the first journey arc, framed
        // by dense scanned vegetation rather than isolated on an empty snowfield.
        const shrineX = 26.0, shrineZ = -31.8;
        const shrineY = this.terrain.heightAt(shrineX, shrineZ);
        for (const side of [-1.25, 1.25]) {
            wood.push(timber(scene, "shrinePost", shrineX + side, shrineY + 1.85, shrineZ, 3.7, 0.16));
        }
        wood.push(timber(scene, "shrineBeam", shrineX, shrineY + 3.35, shrineZ, 3.2, 0.18, 0, true));
        for (let i = -4; i <= 4; i++) {
            wood.push(box(scene, "shrineRoofSlat", shrineX + i * 0.42, shrineY + 3.62, shrineZ, 0.34, 0.12, 3.3, i * 0.008));
        }
        this._buildPrayerMarker(shrineX - 2.4, shrineZ + 0.4, shrineY, 0, wood, cloth);
        this._buildPrayerMarker(shrineX + 2.4, shrineZ + 0.4, shrineY, 0, wood, cloth);
        this._collider(shrineX, shrineZ, 2.1, 1.6, 0, "trail shrine");

        this._addMerged(merge(wood, "landmarkTimber"), "wood");
        this._addMerged(merge(rocks, "landmarkStonework"), "rock");
        this._addMerged(merge(snow, "landmarkSnowCaps"), "snow");
        this._addMerged(merge(cloth, "landmarkPrayerCloth"), "cloth");
    }

    _buildPrayerMarker(x, z, groundY, yaw, wood, cloth) {
        wood.push(timber(this.scene, "prayerPole", x, groundY + 1.8, z, 3.6, 0.05, yaw));
        const colors = 5;
        for (let i = 0; i < colors; i++) {
            const flag = MeshBuilder.CreatePlane("prayerCloth", {
                width: 0.62,
                height: 0.28,
                sideOrientation: Mesh.DOUBLESIDE,
            }, this.scene);
            cloth.push(baked(
                flag,
                x + Math.cos(yaw) * (0.38 + i * 0.38),
                groundY + 2.9 - i * 0.18,
                z - Math.sin(yaw) * (0.38 + i * 0.38),
                null,
                new Vector3(0, yaw + Math.PI * 0.5, 0)
            ));
        }
    }

    _collider(x, z, rx, rz, yaw, kind) {
        this.colliders.push({ x, z, rx, rz, yaw, kind });
    }

    _buildContactIndex() {
        const index = (contacts, target) => {
            for (const contact of contacts) {
                const cx = Math.floor(contact.x / BIOME_CELL_SIZE);
                const cz = Math.floor(contact.z / BIOME_CELL_SIZE);
                const key = cx + ":" + cz;
                const bucket = target.get(key) || [];
                bucket.push(contact);
                target.set(key, bucket);
            }
        };
        index(this.colliders, this.hardContactCells);
        index(this.softContacts, this.softContactCells);
    }

    _contactsNear(position, index) {
        const cx = Math.floor(position.x / BIOME_CELL_SIZE);
        const cz = Math.floor(position.z / BIOME_CELL_SIZE);
        const nearby = [];
        for (let z = cz - 1; z <= cz + 1; z++) {
            for (let x = cx - 1; x <= cx + 1; x++) {
                const bucket = index.get(x + ":" + z);
                if (bucket) nearby.push(...bucket);
            }
        }
        return nearby;
    }

    /**
     * Elliptical hard contacts follow each object's footprint much more closely
     * than the old circular broad phase. Centimetre-scale rocks are separate
     * walkable surfaces: they lift a footfall and can break a fast surf edge,
     * while trees, boulders and built artifacts absorb motion completely.
     */
    resolveMotion(current, next, velocity, dt, controller, rig) {
        let hit = false;
        controller.beginSurfaceContacts();

        for (const obstacle of this._contactsNear(next, this.hardContactCells)) {
            const cos = Math.cos(obstacle.yaw || 0);
            const sin = Math.sin(obstacle.yaw || 0);
            const dx = next.x - obstacle.x;
            const dz = next.z - obstacle.z;
            const lx = dx * cos - dz * sin;
            const lz = dx * sin + dz * cos;
            const rx = obstacle.rx + 0.38;
            const rz = obstacle.rz + 0.38;
            const q = Math.hypot(lx / rx, lz / rz);
            if (q >= 1) continue;

            const angle = Math.atan2(lz / rz, lx / rx);
            const bx = Math.cos(angle) * rx;
            const bz = Math.sin(angle) * rz;
            const wx = bx * cos + bz * sin;
            const wz = -bx * sin + bz * cos;
            let nx = wx;
            let nz = wz;
            const nl = Math.hypot(nx, nz) || 1;
            nx /= nl;
            nz /= nl;
            next.x = obstacle.x + wx + nx * 0.035;
            next.z = obstacle.z + wz + nz * 0.035;
            velocity.x = 0;
            velocity.z = 0;
            hit = true;
            controller.registerImpact(nx, nz, rig);
        }

        for (const contact of this._contactsNear(next, this.softContactCells)) {
            const cos = Math.cos(contact.yaw || 0);
            const sin = Math.sin(contact.yaw || 0);
            const dx = next.x - contact.x;
            const dz = next.z - contact.z;
            const lx = dx * cos - dz * sin;
            const lz = dx * sin + dz * cos;
            const q = Math.hypot(lx / (contact.rx + 0.24), lz / (contact.rz + 0.24));
            if (q < 1) controller.registerSurfaceContact(contact, dx, dz, rig);
        }

        this.contactPulse = hit ? 1 : Math.max(0, this.contactPulse - dt * 3.5);
    }

    materialFromAsset(kind, sourceMaterial, slug) {
        const key = slug + ":" + (sourceMaterial?.uniqueId ?? "none") + ":" + kind;
        const cached = this.materialCache.get(key);
        if (cached) return cached;

        const fallback = this._textureSet(PALETTE[kind].texture);
        const options = {
            albedo: sourceMaterial?.albedoTexture || fallback.albedo,
            normal: sourceMaterial?.bumpTexture || fallback.normal,
            rough: sourceMaterial?.metallicTexture || fallback.rough,
            alphaCutoff: sourceMaterial?.needAlphaTesting?.()
                ? (sourceMaterial.alphaCutOff || 0.36)
                : sourceMaterial?.transparencyMode != null ? 0.18 : 0,
            backFaceCulling: sourceMaterial?.backFaceCulling ?? true,
            textureScale: 1,
        };
        const material = this._material(kind, options, "asset-" + slug);
        this.materialCache.set(key, material);
        return material;
    }

    prepareAssetMaterial(material, kind, slug) {
        if (!material) return this._material(kind, null, "asset-fallback-" + slug);
        material.name = "scan-" + slug + "-" + material.uniqueId;
        material.backFaceCulling = true;
        if ("metallic" in material) material.metallic = Math.min(material.metallic ?? 0, 0.08);
        if ("roughness" in material) material.roughness = Math.max(material.roughness ?? 0.72, 0.56);
        if ("environmentIntensity" in material) material.environmentIntensity = 0.42;
        this.nativeAssetMaterials.add(material);
        return material;
    }

    registerAssetMesh(mesh, kind) {
        this.meshes.push(mesh);
        this.materialMeshes.set(mesh.material, mesh);
        this._registerCaster(mesh, kind);
    }

    _material(kind, options = null, namePrefix = "environment") {
        const p = PALETTE[kind];
        const material = new ShaderMaterial(
            namePrefix + "-" + kind + "-" + this.materials.length,
            this.scene,
            { vertex: "environment", fragment: "environment" },
            {
                attributes: ["position", "normal", "uv"],
                uniforms: [
                    "world", "viewProjection", "cameraPos", "playerPos", "playerSpeed",
                    "sunDir", "sunRadiance", "shR", "albedo", "snowTint", "snowAmount",
                    "roughness", "noiseScale", "fogDensity", "time", "windAmount",
                    "interactionAmount", "textureScale", "alphaCutoff",
                ],
                samplers: ["albedoTex", "normalTex", "roughTex"],
                shaderLanguage: ShaderLanguage.WGSL,
            }
        );
        const textures = options || this._textureSet(p.texture);
        material.backFaceCulling = options?.backFaceCulling ?? kind !== "cloth";
        material.setColor3("albedo", p.albedo);
        material.setColor3("snowTint", new Color3(0.78, 0.86, 0.95));
        material.setFloat("snowAmount", p.snow);
        material.setFloat("roughness", kind === "cloth" ? 0.68 : 0.88);
        material.setFloat("noiseScale", p.noise);
        material.setFloat("textureScale", options?.textureScale ?? p.scale);
        material.setFloat("alphaCutoff", options?.alphaCutoff || 0);
        material.setFloat("windAmount", kind === "grass" ? 0.075 : kind === "cloth" ? 0.034 : kind === "bush" || kind === "tundra" ? 0.016 : kind === "foliage" ? 0.006 : 0);
        material.setFloat("interactionAmount", kind === "grass" ? 1 : kind === "bush" || kind === "tundra" ? 0.48 : 0);
        material.setTexture("albedoTex", textures.albedo);
        material.setTexture("normalTex", textures.normal);
        material.setTexture("roughTex", textures.rough);
        material.metadata = { environmentKind: kind };
        this.materials.push(material);
        return material;
    }

    _textureSet(kind) {
        const cached = this.textureSets.get(kind);
        if (cached) return cached;
        const [albedoUrl, normalUrl, roughUrl] = TEXTURE_URLS[kind];
        const make = (url, name) => {
            const texture = new Texture(url, this.scene, false, false, Constants.TEXTURE_TRILINEAR_SAMPLINGMODE);
            texture.name = "world-" + kind + "-" + name;
            texture.wrapU = Constants.TEXTURE_WRAP_ADDRESSMODE;
            texture.wrapV = Constants.TEXTURE_WRAP_ADDRESSMODE;
            texture.anisotropicFilteringLevel = 8;
            return texture;
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
        mesh.material = this._material(kind);
        this.meshes.push(mesh);
        this.materialMeshes.set(mesh.material, mesh);
        this.triangles += mesh.getTotalIndices() / 3;
        this._registerCaster(mesh, kind);
    }

    _registerCaster(mesh, kind) {
        // Alpha-card vegetation is rendered with cutout transparency in the
        // beauty pass. Keeping it out of the opaque-only prepasses prevents
        // rectangular grass/shrub silhouettes while solid scenery continues
        // to receive proper depth and cascaded shadows.
        const maskedVegetation = kind === "grass" || kind === "bush" || kind === "tundra" || kind === "foliage" || kind === "cloth";
        if (maskedVegetation) return;

        if (!this._depthMaterial) {
            this._depthMaterial = new ShaderMaterial(
                "environmentDepth",
                this.scene,
                { vertex: "environmentDepth", fragment: "prepass" },
                {
                    attributes: ["position"],
                    uniforms: ["world", "viewProjection"],
                    shaderLanguage: ShaderLanguage.WGSL,
                }
            );
            this._depthMaterial.backFaceCulling = false;
        }
        this.depthPass.registerCaster(mesh, this._depthMaterial);

        this.shadows.registerCaster(mesh, (cascade) => {
            if (!this._shadowMaterials[cascade]) {
                const shadow = new ShaderMaterial(
                    "environmentShadow" + cascade,
                    this.scene,
                    { vertex: "environmentShadow", fragment: "terrainDepth" },
                    {
                        attributes: ["position"],
                        uniforms: ["world", "lightViewProjection"],
                        shaderLanguage: ShaderLanguage.WGSL,
                    }
                );
                shadow.backFaceCulling = false;
                this._shadowMaterials[cascade] = shadow;
            }
            return this._shadowMaterials[cascade];
        });
    }

    async warmUp() {
        for (const material of this.nativeAssetMaterials) {
            const mesh = this.meshes.find((candidate) => candidate.material === material);
            if (mesh) await whenReady(material, "scan:" + material.name, [mesh, !!mesh.instances?.length]);
        }
        for (const material of this.materials) {
            const mesh = this.materialMeshes.get(material);
            if (mesh) {
                const instanced = !!(mesh.hasThinInstances || mesh.instances?.length);
                await whenReady(material, "environment:" + material.name, [mesh, instanced]);
            }
        }
        const instancedMesh = this.meshes.find((mesh) => mesh.hasThinInstances || mesh.instances?.length);
        const depthMesh = instancedMesh || this.meshes[0];
        if (depthMesh) {
            const instanced = !!(depthMesh.hasThinInstances || depthMesh.instances?.length);
            await whenReady(this._depthMaterial, "environment depth", [depthMesh, instanced]);
            for (let cascade = 0; cascade < this._shadowMaterials.length; cascade++) {
                const shadow = this._shadowMaterials[cascade];
                if (shadow) await whenReady(shadow, "environment shadow " + cascade, [depthMesh, instanced]);
            }
        }
    }

    update(time, character) {
        this.assetField?.update(character.position);
        for (const material of this.materials) {
            material.setVector3("cameraPos", this.scene.activeCamera.position);
            material.setVector3("playerPos", character.position);
            material.setFloat("playerSpeed", character.speed);
            material.setVector3("sunDir", this.sky.sunDir);
            material.setColor3("sunRadiance", this.sky.sunRadiance);
            material.setArray4("shR", this.sky.sh);
            material.setFloat("fogDensity", S.fogDensity);
            material.setFloat("time", time);
        }
    }

    dispose() {
        this.assetField?.dispose();
        for (const mesh of this.meshes) mesh.dispose(false, false);
        for (const material of this.materials) material.dispose(false, false);
        for (const material of this.nativeAssetMaterials) material.dispose(false, false);
        for (const textures of this.textureSets.values()) {
            textures.albedo.dispose();
            textures.normal.dispose();
            textures.rough.dispose();
        }
        this._depthMaterial?.dispose();
        this.assetFill?.dispose();
        this.assetSun?.dispose();
    }
}
