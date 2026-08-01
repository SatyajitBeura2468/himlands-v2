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

All model geometry and textures are stored as full-resolution, pre-flattened runtime GLB packages under `public/models/`, so the runtime does not rely on third-party requests or spend the opening sequence merging source scenes. The geometry was not simplified. The imported resources are integrated through the custom HIMLANDS WebGPU material, snow, fog, lighting, depth, and shadow systems.
