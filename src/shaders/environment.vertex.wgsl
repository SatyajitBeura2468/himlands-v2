// World props are baked into world space at build time. Keeping this vertex
// path tiny means pines, rocks, shrine beams and cairns can share one material
// family without touching the terrain clipmap.

attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;

uniform viewProjection: mat4x4f;
uniform cameraPos: vec3f;
uniform playerPos: vec3f;
uniform playerSpeed: f32;
uniform time: f32;
uniform windAmount: f32;
uniform interactionAmount: f32;

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vViewDist: f32;
varying vUV: vec2f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var world = vertexInputs.position;
    let bladePhase = 0.5 + 0.5 * sin(world.y * 0.18);
    let wind = sin(world.x * 0.31 + world.z * 0.17 + uniforms.time) * uniforms.windAmount * bladePhase;
    world.x += wind;
    world.z += cos(world.z * 0.27 + uniforms.time * 0.87) * uniforms.windAmount * 0.35 * bladePhase;
    let distanceToPlayer = distance(world.xz, uniforms.playerPos.xz);
    let contact = smoothstep(5.0, 0.0, distanceToPlayer)
        * clamp(uniforms.playerSpeed / 5.0, 0.0, 1.0)
        * uniforms.interactionAmount;
    world.x += sin(world.y * 1.7 + uniforms.time) * contact * 0.22;
    world.z += cos(world.y * 1.4 + uniforms.time) * contact * 0.14;
    vertexOutputs.vWorld = world;
    vertexOutputs.vNormal = normalize(vertexInputs.normal);
    vertexOutputs.vUV = vertexInputs.uv;
    vertexOutputs.vViewDist = distance(world, uniforms.cameraPos);
    vertexOutputs.position = uniforms.viewProjection * vec4f(world, 1.0);
}
