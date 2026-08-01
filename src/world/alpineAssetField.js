import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";

import { ASSET_SPECS, BIOME_CELL_SIZE } from "./biomeDistribution.js";

function resetTransform(mesh) {
    mesh.parent = null;
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.rotationQuaternion = null;
    mesh.scaling.set(1, 1, 1);
    mesh.computeWorldMatrix(true);
}

function bakeImportedMeshes(result) {
    const meshes = result.meshes.filter((mesh) => mesh.getTotalVertices?.() > 0);
    const groups = new Map();

    // Preserve the complete glTF node hierarchy once, in geometry. From this
    // point onward every source is a clean origin-centred mesh suitable for
    // thousands of hardware instances.
    for (const mesh of meshes) mesh.computeWorldMatrix(true);
    for (const mesh of meshes) {
        const material = mesh.material;
        const world = mesh.getWorldMatrix().clone();
        mesh.bakeTransformIntoVertices(world);
        // Babylon's glTF root converts handedness with a negative determinant.
        // Baking that reflection into vertices reverses triangle winding; once
        // the root is removed, ordinary back-face culling would make the full
        // scanned asset disappear. Restore the winding once in source geometry
        // instead of paying for double-sided rendering on every instance.
        if (world.determinant() < 0) mesh.flipFaces(false);
        resetTransform(mesh);
        // glTF primitives that share a material may still expose different
        // vertex streams (for example, one has tangents and another does not).
        // Babylon only merges compatible layouts, so retain that distinction.
        const layout = mesh.getVerticesDataKinds().slice().sort().join(",");
        const key = (material?.uniqueId ?? -1) + ":" + layout;
        const group = groups.get(key) || { material, meshes: [] };
        group.meshes.push(mesh);
        groups.set(key, group);
    }

    const sources = [];
    for (const group of groups.values()) {
        let source;
        if (group.meshes.length === 1) {
            source = group.meshes[0];
        } else {
            source = Mesh.MergeMeshes(group.meshes, true, true);
            if (!source) continue;
        }
        source.material = group.material;
        source.isPickable = false;
        source.alwaysSelectAsActiveMesh = true;
        source.renderingGroupId = 1;
        sources.push({ mesh: source, sourceMaterial: group.material });
    }

    for (const mesh of result.meshes) {
        if (!meshes.includes(mesh)) mesh.setEnabled(false);
    }
    return sources;
}

/**
 * Loads the CC0 production models once, then partitions their thin instances
 * into 72 m cells. Geometry and textures remain shared; cells outside the
 * character's local horizon are disabled, so density does not become an
 * unbounded per-frame vertex cost. Babylon's regular hardware instances are
 * used deliberately: unlike thin-instance buffers, their transforms remain
 * mesh-local even when the production geometry is shared by many chunks.
 */
export class AlpineAssetField {
    constructor(scene, distribution, host) {
        this.scene = scene;
        this.distribution = distribution;
        this.host = host;
        this.groups = [];
        this.sources = [];
        this.sourceRoots = [];
        this.instanceCount = 0;
        this.triangles = 0;
    }

    async build() {
        // Every bundle is local and independent. Parallel parsing keeps the
        // authored seven-second loading sequence from being extended by twelve
        // avoidable network round trips while retaining full-resolution data.
        await Promise.all(
            Object.entries(ASSET_SPECS).map(([slug, spec]) => this._loadAsset(slug, spec))
        );
    }

    async _loadAsset(slug, spec) {
        const result = await SceneLoader.ImportMeshAsync(
            "",
            "/models/" + (spec.folder || slug) + "/",
            spec.file || "runtime.glb",
            this.scene
        );
        this.sourceRoots.push(...result.meshes);
        const sources = bakeImportedMeshes(result);
        const chunkSize = BIOME_CELL_SIZE * spec.chunkCells;
        const chunkMap = new Map();
        for (const cell of this.distribution.cells.values()) {
            const placements = cell.assets.get(slug);
            if (!placements?.length) continue;
            // Centre the render grid on the origin so the opening valley owns
            // one coherent detail chunk instead of sitting on four seams.
            const cx = Math.floor((cell.x + chunkSize * 0.5) / chunkSize);
            const cz = Math.floor((cell.z + chunkSize * 0.5) / chunkSize);
            const key = cx + ":" + cz;
            let chunk = chunkMap.get(key);
            if (!chunk) {
                chunk = {
                    x: cx * chunkSize,
                    z: cz * chunkSize,
                    placements: [],
                };
                chunkMap.set(key, chunk);
            }
            chunk.placements.push(...placements);
        }
        const relevantChunks = [...chunkMap.values()];

        for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex++) {
            const { mesh: source, sourceMaterial } = sources[sourceIndex];
            source.name = "assetSource-" + slug + "-" + sourceIndex;
            source.setEnabled(true);
            this.sources.push(source);

            // Preserve the glTF's authored PBR material, including its native
            // normal/roughness/alpha configuration. The previous conversion to
            // a generic shader discarded exactly the microsurface response that
            // makes these scans read as bark, needles, stone and dry vegetation.
            const material = this.host.prepareAssetMaterial(sourceMaterial, spec.kind, slug);
            source.material = material;
            const chunks = [];
            let sourcePlaced = false;
            for (let chunkIndex = 0; chunkIndex < relevantChunks.length; chunkIndex++) {
                const chunk = relevantChunks[chunkIndex];
                const placements = chunk.placements;
                if (!placements.length) continue;
                const nodes = [];
                for (let i = 0; i < placements.length; i++) {
                    const p = placements[i];
                    let node;
                    if (!sourcePlaced) {
                        node = source;
                        sourcePlaced = true;
                    } else {
                        node = source.createInstance(slug + "-" + chunkIndex + "-" + i + "-" + sourceIndex);
                        nodes.push(node);
                    }
                    node.position.set(p.x, p.y, p.z);
                    node.rotationQuaternion = null;
                    node.rotation.set(0, p.yaw, 0);
                    node.scaling.set(p.sx, p.sy, p.sz);
                    node.isPickable = false;
                    node.isVisible = true;
                    node.visibility = 1;
                    node.alwaysSelectAsActiveMesh = false;
                    node.renderingGroupId = 1;
                }
                chunks.push({ x: chunk.x, z: chunk.z, nodes, visible: true });
                if (sourceIndex === 0) this.instanceCount += placements.length;
                this.triangles += (source.getTotalIndices() / 3) * placements.length;
            }
            this.host.registerAssetMesh(source, spec.kind, sourceMaterial);
            this.groups.push({
                maxDistance2: (spec.maxDistance + chunkSize * 0.55) ** 2,
                chunks,
            });
        }
    }

    update(position) {
        for (const group of this.groups) {
            for (const chunk of group.chunks) {
                const dx = position.x - chunk.x;
                const dz = position.z - chunk.z;
                const visible = dx * dx + dz * dz <= group.maxDistance2;
                if (chunk.visible === visible) continue;
                chunk.visible = visible;
                for (const node of chunk.nodes) node.setEnabled(visible);
            }
        }
    }

    dispose() {
        // Registered source meshes (and their instances) are owned by
        // Environment. Dispose only loader roots that did not become sources.
        for (const root of this.sourceRoots) {
            if (!root.isDisposed() && !this.sources.includes(root)) root.dispose(false, false);
        }
    }
}
