#include<instancesDeclaration>

attribute position: vec3f;

uniform viewProjection: mat4x4f;

varying vViewZ: f32;
varying vMask: f32;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    #include<instancesVertex>
    let world = finalWorld * vec4f(vertexInputs.position, 1.0);
    let clip = uniforms.viewProjection * world;
    vertexOutputs.vViewZ = clip.w;
    vertexOutputs.vMask = 0.0;
    vertexOutputs.position = clip;
}
