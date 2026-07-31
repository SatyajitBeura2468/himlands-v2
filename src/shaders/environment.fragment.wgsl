#include<snowNoise>
#include<snowShading>

varying vWorld: vec3f;
varying vNormal: vec3f;
varying vViewDist: f32;

uniform cameraPos: vec3f;
uniform sunDir: vec3f;
uniform sunRadiance: vec3f;
uniform shR: array<vec4f, 9>;
uniform albedo: vec3f;
uniform snowTint: vec3f;
uniform snowAmount: f32;
uniform roughness: f32;
uniform noiseScale: f32;
uniform fogDensity: f32;

@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
    let N = normalize(input.vNormal);
    let V = normalize(uniforms.cameraPos - input.vWorld);
    let noise = 0.5 + 0.5 * noise3(input.vWorld * uniforms.noiseScale);

    // Snow collects on upward-facing planes and breaks across the object with
    // a soft, world-locked noise field instead of a painted-on hard line.
    let cap = smoothstep(0.48, 0.86, N.y) * uniforms.snowAmount;
    let flecks = smoothstep(0.58, 0.83, noise) * uniforms.snowAmount * 0.24;
    let snowMask = clamp(cap + flecks, 0.0, 1.0);
    let surface = mix(uniforms.albedo, uniforms.snowTint, snowMask);

    let wrap = wrapDiffuse(dot(N, uniforms.sunDir), 0.32);
    let direct = surface * uniforms.sunRadiance * wrap * 0.30;
    let ambient = surface * shIrradiance(N, uniforms.shR) * 0.22;
    let rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0) * 0.10;
    var color = direct + ambient + surface * rim;

    // Props belong to the same aerial perspective as the snowfield. This is
    // intentionally restrained near the player and grows toward the range.
    let haze = 1.0 - exp(-max(0.0, input.vViewDist - 18.0) * uniforms.fogDensity);
    let skyFill = vec3f(0.50, 0.60, 0.72);
    color = mix(color, skyFill, clamp(haze * 0.72, 0.0, 0.82));
    fragmentOutputs.color = vec4f(max(color, vec3f(0.0)), 1.0);
}
