import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PLAY_RADIUS } from "../terrain/heightfield.js";

export const BIOME_CELL_SIZE = 72;

export const ASSET_SPECS = {
    // The camera reads far beyond the old 46-82 m streaming ring. Keeping the
    // production assets alive through the middle distance is what turns the
    // valley from isolated props into a continuous biome.
    fir_sapling: { kind: "foliage", maxDistance: 172, chunkCells: 1, folder: "fir_sapling", file: "runtime-lod.glb" },
    fir_sapling_hero: { kind: "foliage", maxDistance: 64, chunkCells: 1, folder: "fir_sapling", file: "runtime.glb" },
    grass_medium_01: { kind: "grass", maxDistance: 62, chunkCells: 1, file: "runtime-lod.glb" },
    shrub_02: { kind: "bush", maxDistance: 82, chunkCells: 1, file: "runtime-lod.glb" },
    shrub_03: { kind: "tundra", maxDistance: 76, chunkCells: 1, file: "runtime-lod.glb" },
    boulder_01: { kind: "rock", maxDistance: 132, chunkCells: 1, file: "runtime-lod.glb" },
    rock_07: { kind: "rock", maxDistance: 84, chunkCells: 1, file: "runtime-lod.glb" },
    stone_01: { kind: "rock", maxDistance: 68, chunkCells: 1, file: "runtime-lod.glb" },
    tree_stump_01: { kind: "wood", maxDistance: 86, chunkCells: 1, file: "runtime-lod.glb" },
    pine_roots: { kind: "wood", maxDistance: 82, chunkCells: 1, file: "runtime-lod.glb" },
    modular_wooden_pier: { kind: "wood", maxDistance: 360, chunkCells: 1, file: "runtime-lod.glb" },
    rock_moss_set_01: { kind: "rock", maxDistance: 96, chunkCells: 1, file: "runtime-lod.glb" },
    namaqualand_stones_01: { kind: "rock", maxDistance: 72, chunkCells: 1, file: "runtime-lod.glb" },
};

function hash32(x) {
    x |= 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
    return (x ^ (x >>> 15)) >>> 0;
}

function rngFor(cx, cz) {
    let state = hash32(Math.imul(cx, 92837111) ^ Math.imul(cz, 689287499) ^ 0x48f3a95d);
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function cellKey(cx, cz) {
    return cx + ":" + cz;
}

function scatterPoint(cx, cz, random) {
    return [
        (cx + random()) * BIOME_CELL_SIZE,
        (cz + random()) * BIOME_CELL_SIZE,
    ];
}

function insideWorld(x, z) {
    return x * x + z * z < (PLAY_RADIUS - 14) * (PLAY_RADIUS - 14);
}

function clearOpening(x, z, hard) {
    if (!hard) return true;
    const dx = x + 2;
    if (dx * dx + z * z < 14 * 14) return false;
    return !(z > -6 && z < 74 && Math.abs(x + 2) < 4.5);
}

/**
 * Build a deterministic, terrain-aware placement atlas. The rendered asset
 * meshes are instanced later; this object only owns world positions and the
 * gameplay contact volumes derived from them.
 */
export function buildBiomeDistribution(terrain) {
    const cells = new Map();
    const hard = [];
    const soft = [];
    const normal = new Vector3();
    const limit = Math.ceil(PLAY_RADIUS / BIOME_CELL_SIZE);
    const stats = {};

    const add = (cx, cz, asset, x, z, scale, yaw, options = {}) => {
        if (!insideWorld(x, z) || !clearOpening(x, z, options.hard)) return;
        const y = terrain.heightAt(x, z) + (options.sink || 0);
        const key = cellKey(cx, cz);
        let cell = cells.get(key);
        if (!cell) {
            cell = {
                key,
                cx,
                cz,
                x: (cx + 0.5) * BIOME_CELL_SIZE,
                z: (cz + 0.5) * BIOME_CELL_SIZE,
                assets: new Map(),
            };
            cells.set(key, cell);
        }
        const list = cell.assets.get(asset) || [];
        list.push({
            x, y, z, yaw,
            sx: scale * (options.stretchX || 1),
            sy: scale * (options.stretchY || 1),
            sz: scale * (options.stretchZ || 1),
        });
        cell.assets.set(asset, list);
        stats[asset] = (stats[asset] || 0) + 1;

        if (options.hard) {
            hard.push({
                x, z, yaw,
                rx: options.rx * scale,
                rz: options.rz * scale,
                kind: options.kind || asset,
            });
        } else if (options.soft) {
            soft.push({
                x, z, yaw,
                rx: options.rx * scale,
                rz: options.rz * scale,
                lift: options.lift * scale,
                slip: options.slip || 0,
                kind: options.kind || asset,
            });
        }
    };

    for (let cz = -limit; cz < limit; cz++) {
        for (let cx = -limit; cx < limit; cx++) {
            const centerX = (cx + 0.5) * BIOME_CELL_SIZE;
            const centerZ = (cz + 0.5) * BIOME_CELL_SIZE;
            if (centerX * centerX + centerZ * centerZ > (PLAY_RADIUS + BIOME_CELL_SIZE) ** 2) continue;

            const random = rngFor(cx, cz);
            terrain.normalAt(centerX, centerZ, normal);
            const slope = 1 - Math.max(0, normal.y);
            const exposed = Math.min(1, Math.hypot(centerX, centerZ) / PLAY_RADIUS);

            // Ground cover is the density foundation. Each imported instance
            // contains dozens of individually modelled stems and leaf cards.
            const grassCount = 62 + Math.floor(random() * 30);
            for (let i = 0; i < grassCount; i++) {
                const [x, z] = scatterPoint(cx, cz, random);
                add(cx, cz, "grass_medium_01", x, z, 0.72 + random() * 1.25, random() * Math.PI * 2, {
                    sink: -0.035,
                    stretchY: 0.75 + random() * 0.7,
                });
            }

            const tundraCount = 16 + Math.floor(random() * 8);
            for (let i = 0; i < tundraCount; i++) {
                const [x, z] = scatterPoint(cx, cz, random);
                const large = random() > 0.68;
                add(cx, cz, large ? "shrub_02" : "shrub_03", x, z,
                    large ? 0.42 + random() * 0.40 : 1.4 + random() * 1.7,
                    random() * Math.PI * 2,
                    { sink: -0.08 });
            }

            // Pebble fields give the immediate ground the missing centimetre-
            // scale structure. These are walkable contacts, not hard walls.
            const stoneCount = 23 + Math.floor(random() * 12);
            for (let i = 0; i < stoneCount; i++) {
                const [x, z] = scatterPoint(cx, cz, random);
                const family = random();
                const asset = family < 0.46 ? "rock_07" : family < 0.78 ? "stone_01" : "namaqualand_stones_01";
                const scale = asset === "rock_07" ? 1.4 + random() * 3.2 : asset === "stone_01" ? 2.1 + random() * 3.8 : 0.85 + random() * 1.2;
                add(cx, cz, asset, x, z, scale, random() * Math.PI * 2, {
                    sink: -0.035,
                    soft: true,
                    rx: asset === "namaqualand_stones_01" ? 0.48 : 0.13,
                    rz: asset === "namaqualand_stones_01" ? 0.22 : 0.16,
                    lift: asset === "namaqualand_stones_01" ? 0.09 : 0.045,
                    slip: 0.25 + random() * 0.42,
                    kind: "loose stone",
                });
            }

            const rockCount = 4 + Math.floor(random() * 3);
            for (let i = 0; i < rockCount; i++) {
                const [x, z] = scatterPoint(cx, cz, random);
                const mossy = random() > 0.70;
                const scale = mossy ? 0.48 + random() * 0.58 : 2.2 + random() * 3.4;
                add(cx, cz, mossy ? "rock_moss_set_01" : "rock_07", x, z, scale, random() * Math.PI * 2, {
                    sink: -0.10,
                    hard: scale > (mossy ? 0.72 : 4.1),
                    soft: scale <= (mossy ? 0.72 : 4.1),
                    rx: mossy ? 1.18 : 0.14,
                    rz: mossy ? 1.36 : 0.20,
                    lift: mossy ? 0.28 : 0.055,
                    slip: 0.38,
                    kind: mossy ? "rock shelf" : "trail rock",
                });
            }

            if (random() > 0.42) {
                const [x, z] = scatterPoint(cx, cz, random);
                const scale = 1.25 + random() * 2.15;
                add(cx, cz, "boulder_01", x, z, scale, random() * Math.PI * 2, {
                    sink: -0.24 * scale,
                    hard: true,
                    rx: 0.56,
                    rz: 0.78,
                    kind: "boulder",
                    stretchX: 0.82 + random() * 0.55,
                    stretchY: 0.78 + random() * 0.48,
                });
            }

            // High-detail conifers are deliberately irregular: sheltered cells
            // carry groves, exposed ridges carry only a few wind-cut saplings.
            const treeChance = Math.max(0.30, 0.94 - slope * 2.15 - exposed * 0.16);
            const treeCount = random() < treeChance ? 2 + Math.floor(random() * 4) : 0;
            for (let i = 0; i < treeCount; i++) {
                const [x, z] = scatterPoint(cx, cz, random);
                const scale = 2.7 + random() * 2.45;
                add(cx, cz, "fir_sapling", x, z, scale, random() * Math.PI * 2, {
                    sink: -0.08,
                    hard: true,
                    rx: 0.12,
                    rz: 0.12,
                    kind: "pine trunk",
                    stretchY: 0.90 + random() * 0.24,
                });
            }

            if (random() > 0.78) {
                const [x, z] = scatterPoint(cx, cz, random);
                const roots = random() > 0.48;
                add(cx, cz, roots ? "pine_roots" : "tree_stump_01", x, z,
                    roots ? 0.70 + random() * 0.55 : 0.62 + random() * 0.76,
                    random() * Math.PI * 2,
                    roots ? {
                        sink: -0.05,
                        soft: true,
                        rx: 0.86,
                        rz: 0.48,
                        lift: 0.10,
                        slip: 0.58,
                        kind: "exposed roots",
                    } : {
                        sink: -0.08,
                        hard: true,
                        rx: 0.62,
                        rz: 0.62,
                        kind: "tree stump",
                    });
            }
        }
    }

    // The opening vista is composed rather than left to chance. It uses the
    // same production assets and interaction metadata as the procedural atlas,
    // but arranges them along the initial camera bearing so the first frame
    // immediately communicates the world's density and visual language.
    const openingRandom = rngFor(914, -327);
    const forwardX = Math.sin(2.4);
    const forwardZ = Math.cos(2.4);
    const rightX = Math.cos(2.4);
    const rightZ = -Math.sin(2.4);
    for (let band = 0; band < 7; band++) {
        const distance = 12 + band * 10;
        const width = 9 + band * 3.2;
        for (let i = 0; i < 34; i++) {
            const lateral = (openingRandom() * 2 - 1) * width;
            const along = distance + (openingRandom() * 2 - 1) * 6;
            const x = -2 + forwardX * along + rightX * lateral;
            const z = forwardZ * along + rightZ * lateral;
            const cx = Math.floor(x / BIOME_CELL_SIZE);
            const cz = Math.floor(z / BIOME_CELL_SIZE);
            const roll = openingRandom();
            if (roll < 0.56) {
                add(cx, cz, "grass_medium_01", x, z, 1.0 + openingRandom() * 1.35, openingRandom() * Math.PI * 2, {
                    sink: -0.025,
                    stretchY: 0.9 + openingRandom() * 0.6,
                });
            } else if (roll < 0.78) {
                add(cx, cz, openingRandom() > 0.42 ? "shrub_03" : "shrub_02", x, z,
                    0.9 + openingRandom() * 1.25, openingRandom() * Math.PI * 2, { sink: -0.06 });
            } else {
                const asset = openingRandom() > 0.45 ? "rock_07" : "namaqualand_stones_01";
                add(cx, cz, asset, x, z, asset === "rock_07" ? 2.4 + openingRandom() * 2.8 : 1.0 + openingRandom(),
                    openingRandom() * Math.PI * 2, {
                        sink: -0.035,
                        soft: true,
                        rx: asset === "rock_07" ? 0.13 : 0.48,
                        rz: asset === "rock_07" ? 0.16 : 0.22,
                        lift: asset === "rock_07" ? 0.05 : 0.09,
                        slip: 0.36,
                        kind: "loose stone",
                    });
            }
        }
        if (band > 0) {
            for (const side of [-1, 1]) {
                for (let grove = 0; grove < 3; grove++) {
                    const lateral = side * (width * (0.48 + grove * 0.19) + openingRandom() * 4.5);
                    const along = distance + (grove - 1) * 3.8 + (openingRandom() - 0.5) * 5;
                    const x = -2 + forwardX * along + rightX * lateral;
                    const z = forwardZ * along + rightZ * lateral;
                    const cx = Math.floor(x / BIOME_CELL_SIZE);
                    const cz = Math.floor(z / BIOME_CELL_SIZE);
                    add(cx, cz, "fir_sapling", x, z, 4.2 + openingRandom() * 3.1,
                        openingRandom() * Math.PI * 2, {
                            sink: -0.06,
                            hard: true,
                            rx: 0.12,
                            rz: 0.12,
                            kind: "pine trunk",
                            stretchY: 0.92 + openingRandom() * 0.23,
                        });
                }
            }
        }
    }

    // Screen-space verified ground anchors from the production camera. These
    // sit on visible ridge faces (not behind their crests), so close detail,
    // mid-ground shrubs and the conifer silhouette all read in the first frame.
    const heroAnchors = [
        [11.5, -8.8], [14.4, -19.2], [26.0, -31.8], [16.7, -37.1],
        [31.6, -62.6], [15.7, -63.3], [4.6, -70.0], [4.8, -16.6],
        [2.5, -25.1], [-1.2, -14.4], [1.3, -10.5], [0.1, -18.3],
    ];
    heroAnchors.forEach(([anchorX, anchorZ], anchorIndex) => {
        const cx = Math.floor(anchorX / BIOME_CELL_SIZE);
        const cz = Math.floor(anchorZ / BIOME_CELL_SIZE);
        for (let i = 0; i < 14; i++) {
            const angle = openingRandom() * Math.PI * 2;
            const radius = 0.45 + openingRandom() * 4.4;
            const x = anchorX + Math.cos(angle) * radius;
            const z = anchorZ + Math.sin(angle) * radius;
            if (i < 7) {
                add(cx, cz, "grass_medium_01", x, z, 1.8 + openingRandom() * 1.7,
                    openingRandom() * Math.PI * 2, {
                        sink: -0.015,
                        stretchY: 1.0 + openingRandom() * 0.65,
                    });
            } else if (i < 12) {
                add(cx, cz, i % 2 ? "shrub_03" : "shrub_02", x, z,
                    i % 2 ? 2.2 + openingRandom() * 1.8 : 0.75 + openingRandom() * 0.55,
                    openingRandom() * Math.PI * 2, { sink: -0.035 });
            } else {
                add(cx, cz, "namaqualand_stones_01", x, z, 1.1 + openingRandom() * 0.75,
                    openingRandom() * Math.PI * 2, {
                        sink: -0.025,
                        soft: true,
                        rx: 0.48,
                        rz: 0.22,
                        lift: 0.09,
                        slip: 0.4,
                        kind: "loose stone",
                    });
            }
        }
        if (anchorIndex <= 10) {
            const treeOffset = (anchorIndex % 2 ? 1 : -1) * (4.8 + openingRandom() * 2.4);
            const treeX = anchorX + rightX * treeOffset;
            const treeZ = anchorZ + rightZ * treeOffset;
            add(Math.floor(treeX / BIOME_CELL_SIZE), Math.floor(treeZ / BIOME_CELL_SIZE), "fir_sapling", treeX, treeZ,
                4.8 + openingRandom() * 2.8, openingRandom() * Math.PI * 2, {
                    sink: -0.025,
                    hard: true,
                    rx: 0.12,
                    rz: 0.12,
                    kind: "pine trunk",
                    stretchY: 1.05 + openingRandom() * 0.15,
                });
        }
    });

    // A hand-composed irregular fir belt frames the opening without relying on
    // synthetic cone or blob silhouettes. The closest pair retains the complete
    // 514k-vertex scan; the remaining trees use a screen-space LOD generated
    // from that same scan, with enough spacing to preserve playable routes.
    const openingFirs = [
        [8.5, -11.5, 6.3], [20.5, -22.5, 7.1], [5.2, -34.8, 5.8],
        [24.5, -45.2, 7.6], [39.5, -57.5, 6.8], [2.8, -57.0, 6.4],
        [12.0, -72.0, 8.1], [48.0, -69.0, 8.5], [-7.5, -42.0, 5.9],
        [-18.0, -28.0, 5.4], [33.0, -18.0, 5.8], [45.0, -34.0, 7.0],
        [-24.0, -53.0, 6.7], [57.0, -48.0, 7.8], [-35.0, -72.0, 7.4],
        [68.0, -82.0, 8.3], [-16.0, -92.0, 7.9], [42.0, -104.0, 8.7],
        [76.0, -116.0, 7.5], [-48.0, -120.0, 8.1], [18.0, -132.0, 7.2],
    ];
    openingFirs.forEach(([x, z, scale], index) => {
        add(Math.floor(x / BIOME_CELL_SIZE), Math.floor(z / BIOME_CELL_SIZE),
            index < 2 ? "fir_sapling_hero" : "fir_sapling", x, z, scale, index * 2.3999632297, {
                sink: -0.07,
                hard: true,
                rx: 0.12,
                rz: 0.12,
                kind: "mature fir trunk",
                stretchX: 0.88 + (index % 4) * 0.055,
                stretchY: 0.94 + (index % 5) * 0.045,
                stretchZ: 0.90 + (index % 3) * 0.07,
            });
    });

    // Thirteen authored crossings create recognisable navigation landmarks. The
    // source is a detailed modular timber pier, sunk and scaled into footbridges.
    const crossings = [
        [13.0, -47.0, 0.72], [-78, 84, 0.25], [96, 146, -0.42], [-188, 214, 1.1], [224, 264, -0.8],
        [-292, 64, 0.62], [338, -96, 1.35], [-402, -188, 0.18], [456, 128, -1.18],
        [-122, -348, 0.86], [174, -438, -0.55], [24, 492, 1.42], [-486, 294, -0.25],
    ];
    crossings.forEach(([x, z, yaw], i) => {
        const cx = Math.floor(x / BIOME_CELL_SIZE);
        const cz = Math.floor(z / BIOME_CELL_SIZE);
        add(cx, cz, "modular_wooden_pier", x, z, 0.54 + (i % 3) * 0.055, yaw, {
            sink: -0.42,
            hard: true,
            rx: 1.55,
            rz: 2.8,
            kind: "timber crossing",
            stretchY: 0.58,
        });
    });

    return { cells, hard, soft, stats };
}
