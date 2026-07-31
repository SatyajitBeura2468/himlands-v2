// World props are baked into world space at build time. Keeping this vertex
// path tiny means pines, rocks, shrine beams and cairns can share one material
// family without touching the terrain clipmap.

attribute position: vec3f;
attribute normal: vec3f;

uniform viewProjection: mat4x4f;
uniform cameraPos: vec3f;
uniform time: f32;
uniform windAmount: f32;

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vViewDist: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    var world = vertexInputs.position;
    world.x += sin(world.y * 2.6 + uniforms.time) * uniforms.windAmount * max(0.0, world.y);
    world.z += cos(world.y * 2.1 + uniforms.time * 0.87) * uniforms.windAmount * 0.35 * max(0.0, world.y);
    vertexOutputs.vWorld = world;
    vertexOutputs.vNormal = normalize(vertexInputs.normal);
    vertexOutputs.vViewDist = distance(world, uniforms.cameraPos);
    vertexOutputs.position = uniforms.viewProjection * vec4f(world, 1.0);
}
