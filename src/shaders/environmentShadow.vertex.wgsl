#include<instancesDeclaration>

attribute position: vec3f;

uniform lightViewProjection: mat4x4f;

@vertex
fn main(input: VertexInputs) -> FragmentInputs {
    #include<instancesVertex>
    let world = finalWorld * vec4f(vertexInputs.position, 1.0);
    vertexOutputs.position = uniforms.lightViewProjection * world;
}
