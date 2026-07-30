import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { input, pollInput, endFrame } from "../core/input.js";
import { MobileControls } from "../ui/mobileControls.js";

const mat = (scene, name, color, emissive = null) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = new Color3(.18,.22,.28); if (emissive) m.emissiveColor = Color3.FromHexString(emissive); return m; };

export function startMobileWebGL(canvas, audio) {
    const engine = new Engine(canvas, true, { preserveDrawingBuffer: false, stencil: false, antialias: true });
    engine.setHardwareScalingLevel(Math.min(1.5, Math.max(1, devicePixelRatio * .8)));
    const scene = new Scene(engine); scene.clearColor = new Color3(.025,.045,.075);
    new HemisphericLight("winter sky", new Vector3(0,1,0), scene).intensity = 1.05;
    const sun = new DirectionalLight("low sun", new Vector3(-.45,-.65,.5), scene); sun.diffuse = new Color3(1,.82,.64); sun.intensity = 2.2;
    const groundMat = mat(scene, "powder snow", "#d9e7ef"); groundMat.roughness = .92;
    const mountainMat = mat(scene, "blue shadow snow", "#738aa0");
    const glowMat = mat(scene, "spell glow", "#b8e9ff", "#5ab9ff"); glowMat.alpha = .86; glowMat.transparencyMode = 2;
    const ground = MeshBuilder.CreateGround("snowfield", { width: 90, height: 90, subdivisions: 70 }, scene); ground.material = groundMat;
    const positions = ground.getVerticesData("position"); for (let i=0;i<positions.length;i+=3) { const x=positions[i], z=positions[i+2]; positions[i+1]=Math.sin(x*.13)*.45+Math.cos(z*.17)*.35+Math.sin((x+z)*.31)*.12; } ground.updateVerticesData("position", positions); ground.convertToFlatShadedMesh();
    for (let i=0;i<12;i++) { const m=MeshBuilder.CreateCylinder("ridge", {diameter:10+Math.random()*15, height:8+Math.random()*17, tessellation:6}, scene); m.position.set((i-6)*10+(Math.random()-.5)*8,4,(i%4)*9+17); m.scaling.y=1.4; m.material=mountainMat; }
    const bodyMat=mat(scene,"character cloak","#101a2c"); const skinMat=mat(scene,"character face","#b77f59");
    const hero=MeshBuilder.CreateCylinder("wanderer",{diameter:.55,height:1.8,tessellation:12},scene); hero.material=bodyMat; const head=MeshBuilder.CreateSphere("hood",{diameter:.48,segments:12},scene); head.material=skinMat; head.parent=hero; head.position.y=.72;
    const camera= new UniversalCamera("camera",new Vector3(0,3,-6),scene); camera.minZ=.08; camera.maxZ=300; camera.fov=.92; scene.activeCamera=camera;
    const snow=new ParticleSystem("snowfall",900,scene); snow.particleTexture=new Texture("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Ccircle cx='4' cy='4' r='3' fill='white'/%3E%3C/svg%3E",scene); snow.emitter=new Vector3(0,8,8); snow.minEmitBox=new Vector3(-40,0,-40); snow.maxEmitBox=new Vector3(40,0,40); snow.minSize=.025; snow.maxSize=.09; snow.minLifeTime=5; snow.maxLifeTime=9; snow.emitRate=180; snow.gravity=new Vector3(0,-.35,0); snow.start();
    const mobileControls=new MobileControls({overlay:{toggle:()=>{}},rig:camera}); let yaw=0,pitch=.22; const impacts=[]; let last=performance.now();
    function cast(n){ audio.spell(n); const ring=MeshBuilder.CreateTorus("spell-ring",{diameter:1.4+n*.2,thickness:.06,tessellation:40},scene); ring.material=glowMat; ring.position.copyFrom(hero.position); ring.position.y=.1; impacts.push({mesh:ring,t:0,n}); }
    engine.runRenderLoop(()=>{ const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now; pollInput(); yaw-=input.lookX; pitch=Math.max(-.05,Math.min(.8,pitch+input.lookY)); hero.position.x+=input.moveX*dt*(input.surf?7:3.2); hero.position.z+=input.moveZ*dt*(input.surf?7:3.2); hero.position.y=.7+Math.sin(now*.006)*.025; camera.position.set(hero.position.x-Math.sin(yaw)*6,hero.position.y+2.9+Math.sin(pitch)*2,hero.position.z-Math.cos(yaw)*6); camera.setTarget(new Vector3(hero.position.x,hero.position.y+.5,hero.position.z)); if(input.spellPressed) cast(input.spellPressed); for(let i=impacts.length-1;i>=0;i--){const p=impacts[i];p.t+=dt;p.mesh.scaling.setAll(1+p.t*2.8);p.mesh.visibility=Math.max(0,1-p.t/.9);p.mesh.rotation.y+=dt*(2+p.n);if(p.t>.9){p.mesh.dispose();impacts.splice(i,1)}} scene.render();endFrame(); });
    return { engine, scene, camera, hero, mobileControls };
}
