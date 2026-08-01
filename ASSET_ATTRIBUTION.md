# Environment Asset Attribution

HIMLANDS V2 locally bundles the following environment resources from [Poly Haven](https://polyhaven.com/). Poly Haven distributes these assets under the [CC0 public-domain dedication](https://polyhaven.com/license), allowing use, modification, and redistribution without attribution requirements. They are nevertheless documented here for provenance.

## High-resolution material maps

- `aerial_rocks_01` - rock albedo, normal, and roughness maps
- `dark_wood` - timber albedo, normal, and roughness maps
- `bark_brown_02` - tree bark albedo, normal, and roughness maps
- `aerial_grass_rock` - alpine ground, grass, and shrub albedo, normal, and roughness maps

## Production glTF models

- `fir_sapling` - high-detail conifer with a fuller gameplay silhouette
- `grass_medium_01` - alpine grass cluster
- `shrub_02` and `shrub_03` - varied tundra shrubs
- `boulder_01` - large natural boulder
- `rock_07` - irregular medium rock
- `stone_01` - small walkable stone
- `tree_stump_01` - weathered stump
- `pine_roots` - exposed root system
- `modular_wooden_pier` - timber crossing components
- `rock_moss_set_01` - clustered stone detail
- `namaqualand_stones_01` - varied ground-stone scatter

The original full-resolution GLB packages are preserved under `public/models/`. Derived `runtime-lod.glb` copies reduce geometry only where screen-space detail cannot resolve the source mesh; all authored 1K PBR textures, normal maps, roughness maps, silhouettes, and materials remain intact. The nearest hero firs continue to use the complete 514k-vertex source mesh. LODs were generated with glTF Transform's meshoptimizer-based simplifier and validated against the glTF specification.

All resources are bundled locally, so the runtime makes no third-party asset requests. Imported geometry retains its authored PBR materials and is integrated with dedicated alpine sun/fill lighting, terrain-aware placement, streaming, depth, collision, and interaction systems.
