import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  ParticleSystem,
  Scene,
  StandardMaterial,
  Texture,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import { heightAt } from '../../shared/data/world';

type Detail='low'|'balanced'|'high';

function softTexture(scene:Scene,size=256){
  const t=new DynamicTexture('QL-SoftMist',{width:size,height:size},scene,false);const ctx=t.getContext();const g=ctx.createRadialGradient(size*.5,size*.5,0,size*.5,size*.5,size*.5);g.addColorStop(0,'rgba(255,255,255,.92)');g.addColorStop(.35,'rgba(255,255,255,.45)');g.addColorStop(.72,'rgba(255,255,255,.12)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);t.hasAlpha=true;t.update();return t;
}

export class XianxiaCinematicAtmosphere{
  readonly root:TransformNode;private mist:Mesh[]=[];private shafts:Mesh[]=[];private particles:ParticleSystem;private detail:Detail;private mistTexture:DynamicTexture;private particleTexture:DynamicTexture;
  constructor(private scene:Scene,anchor:{x:number;z:number},detail:Detail='balanced'){
    this.detail=detail;this.root=new TransformNode('QL-CinematicAtmosphere',scene);const baseY=heightAt(anchor.x,anchor.z);this.mistTexture=softTexture(scene);
    const specs=[[-15,1.2,-15,15,5],[0,.9,-13,18,5],[13,1.5,-10,14,4],[-8,2.4,-26,25,7],[18,2.8,-32,28,8],[-25,3.1,-38,32,9]] as const;
    for(let i=0;i<specs.length;i++){const [x,y,z,w,h]=specs[i];const m=MeshBuilder.CreatePlane(`mist-${i}`,{width:w,height:h,sideOrientation:Mesh.DOUBLESIDE},scene);m.billboardMode=Mesh.BILLBOARDMODE_ALL;m.position.set(anchor.x+x,baseY+y,anchor.z+z);m.parent=this.root;const mat=new StandardMaterial(`mist-mat-${i}`,scene);mat.diffuseTexture=this.mistTexture;mat.opacityTexture=this.mistTexture;mat.diffuseColor=Color3.FromHexString(i<3?'#9DBCC7':'#7899A8');mat.emissiveColor=mat.diffuseColor.scale(.22);mat.alpha=i<3?.105:.06;mat.disableLighting=true;mat.backFaceCulling=false;mat.useAlphaFromDiffuseTexture=true;m.material=mat;this.mist.push(m);}
    for(let i=0;i<3;i++){const beam=MeshBuilder.CreateCylinder(`shaft-${i}`,{diameterTop:1.2,diameterBottom:11.6,height:38,tessellation:24,hasRings:false,enclose:false},scene);beam.position.set(anchor.x-18+i*14,baseY+17,anchor.z-20-i*5);beam.rotation.z=-.42+i*.08;beam.rotation.x=.18;beam.parent=this.root;const mat=new StandardMaterial(`shaft-mat-${i}`,scene);mat.diffuseColor=Color3.Black();mat.emissiveColor=Color3.FromHexString(i===0?'#F7C7A7':'#F3D0B8');mat.alpha=.024-i*.004;mat.disableLighting=true;mat.backFaceCulling=false;beam.material=mat;this.shafts.push(beam);}
    this.particleTexture=softTexture(scene,64);this.particles=new ParticleSystem('QL-AirDust',detail==='high'?180:detail==='balanced'?110:60,scene);this.particles.particleTexture=this.particleTexture;this.particles.emitter=new Vector3(anchor.x,baseY+3,anchor.z-8);this.particles.minEmitBox=new Vector3(-26,-2,-28);this.particles.maxEmitBox=new Vector3(26,8,22);this.particles.color1=Color3.FromHexString('#E8C296').toColor4(.20);this.particles.color2=Color3.FromHexString('#F1D5B2').toColor4(.12);this.particles.minSize=.025;this.particles.maxSize=.075;this.particles.minLifeTime=7;this.particles.maxLifeTime=15;this.particles.emitRate=detail==='high'?18:detail==='balanced'?10:5;this.particles.minEmitPower=.03;this.particles.maxEmitPower=.12;this.particles.direction1=new Vector3(-.08,.04,-.02);this.particles.direction2=new Vector3(.12,.10,.08);this.particles.gravity=Vector3.Zero();this.particles.start();this.setDetail(detail);
  }
  update(time:number){for(let i=0;i<this.mist.length;i++){const s=this.mist[i];s.position.x+=Math.sin(time*.08+i)*.0025;s.position.y+=Math.sin(time*.13+i*.7)*.0012;const mat=s.material as StandardMaterial;mat.alpha=(i<3?(this.detail==='high'?.12:.095):.06)*(1+Math.sin(time*.19+i)*.09);}for(let i=0;i<this.shafts.length;i++)this.shafts[i].rotation.y=Math.sin(time*.035+i)*.08;}
  setDetail(detail:Detail){this.detail=detail;this.shafts.forEach((s,i)=>s.setEnabled(detail==='high'||(detail==='balanced'&&i===0)));this.mist.forEach((m,i)=>m.setEnabled(detail!=='low'||i<2));this.particles.emitRate=detail==='high'?18:detail==='balanced'?10:0;}
  dispose(){this.particles.dispose();this.particleTexture.dispose();this.mistTexture.dispose();this.root.dispose(false,true);}
}
