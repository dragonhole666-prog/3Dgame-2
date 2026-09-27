import {
  Color3,
  Curve3,
  InstancedMesh,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  Texture,
  TransformNode,
  Vector2,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import { WaterMaterial } from '@babylonjs/materials/water/waterMaterial';
import { heightAt } from '../../shared/data/world';
import { XIANXIA_GRADIENTS,sampleXianxiaGradient } from '../rendering/xianxia-visual-style';

type Detail='low'|'balanced'|'high';

function tex(scene:Scene,url:string,u=1,v=1){const t=new Texture(url,scene,true,false,Texture.TRILINEAR_SAMPLINGMODE);t.uScale=u;t.vScale=v;t.anisotropicFilteringLevel=4;return t;}
function pbr(scene:Scene,name:string,color:string,rough=.75,metal=.02){const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromHexString(color);m.roughness=rough;m.metallic=metal;m.environmentIntensity=metal>.2?1.0:.68;return m;}
function textured(scene:Scene,name:string,albedo:string,roughness:string|undefined,normal:string|undefined,repeat:number,rough=.75,metal=0){const m=pbr(scene,name,'#FFFFFF',rough,metal);m.albedoTexture=tex(scene,albedo,repeat,repeat);if(roughness){m.metallicTexture=tex(scene,roughness,repeat,repeat);m.useRoughnessFromMetallicTextureGreen=true;m.useMetallnessFromMetallicTextureBlue=false;}if(normal)m.bumpTexture=tex(scene,normal,repeat,repeat);return m;}
function seeded(seed:number){let s=seed*16807%2147483647;return()=>((s=s*16807%2147483647)-1)/2147483646;}

const asset=(file:string)=>`/assets/hf23/${file}`;

function createCurvedRoof(scene:Scene,name:string,radius=4.6,height=1.8,sides=8,radial=8){
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],normals:number[]=[];
  for(let r=0;r<=radial;r++){const t=r/radial,rr=radius*t;for(let s=0;s<sides;s++){const a=s/sides*Math.PI*2,corner=Math.pow(Math.abs(Math.cos(a*sides/2)),5)*.42*t*t,y=height*(1-Math.pow(t,.72))+corner+Math.pow(t,5)*.24;positions.push(Math.cos(a)*rr,y,Math.sin(a)*rr);uvs.push(s/sides,t);}}
  for(let r=0;r<radial;r++)for(let s=0;s<sides;s++){const n=(s+1)%sides,a=r*sides+s,b=r*sides+n,c=(r+1)*sides+s,d=(r+1)*sides+n;indices.push(a,c,b,b,c,d);}VertexData.ComputeNormals(positions,indices,normals);
  const vd=new VertexData();vd.positions=positions;vd.indices=indices;vd.normals=normals;vd.uvs=uvs;const mesh=new Mesh(name,scene);vd.applyToMesh(mesh);return mesh;
}

function addPavilion(scene:Scene,parent:TransformNode,x:number,z:number,scale=1){
  const group=new TransformNode('QL-Pavilion',scene);group.parent=parent;group.position.set(x,.16,z);group.scaling.setAll(scale);
  const stone=textured(scene,'QL-PavilionStone',asset('stone_albedo.png'),asset('stone_roughness.png'),asset('stone_normal.png'),5,.78,0);
  const wood=textured(scene,'QL-PavilionWood',asset('wood_albedo.png'),asset('wood_roughness.png'),asset('wood_normal.png'),3,.73,.02);
  const roof=textured(scene,'QL-PavilionRoof',asset('roof_albedo.png'),asset('roof_roughness.png'),asset('roof_normal.png'),4,.44,.10);
  const gold=pbr(scene,'QL-PavilionGold','#C99A59',.42,.45);
  const floor=MeshBuilder.CreateCylinder('pavilion-floor',{diameterTop:7.7,diameterBottom:8.3,height:.42,tessellation:32},scene);floor.material=stone;floor.parent=group;floor.receiveShadows=true;
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;const post=MeshBuilder.CreateCylinder('pavilion-post',{diameterTop:.32,diameterBottom:.40,height:4.25,tessellation:12},scene);post.material=wood;post.position.set(Math.cos(a)*2.9,2.12,Math.sin(a)*2.9);post.parent=group;const rail=MeshBuilder.CreateBox('pavilion-rail',{width:1.75,height:.11,depth:.11},scene);rail.material=wood;rail.position.set(Math.cos(a)*2.65,1.15,Math.sin(a)*2.65);rail.rotation.y=-a;rail.parent=group;const lamp=MeshBuilder.CreateCylinder('pavilion-lamp',{diameter:.26,height:.34,tessellation:10},scene);lamp.material=gold;lamp.position.set(Math.cos(a)*2.15,3.25,Math.sin(a)*2.15);lamp.parent=group;}
  const ring=MeshBuilder.CreateTorus('pavilion-ring',{diameter:5.72,thickness:.18,tessellation:64},scene);ring.material=gold;ring.rotation.x=Math.PI/2;ring.position.y=3.55;ring.parent=group;
  const r1=createCurvedRoof(scene,'pavilion-roof',4.6,1.8);r1.material=roof;r1.position.y=3.48;r1.parent=group;const r2=createCurvedRoof(scene,'pavilion-roof-upper',2.6,1.15);r2.material=roof;r2.position.y=5.1;r2.scaling.y=.75;r2.parent=group;
  const finial=MeshBuilder.CreateCylinder('pavilion-finial',{diameterTop:.22,diameterBottom:.46,height:.85,tessellation:12},scene);finial.material=gold;finial.position.y=6.15;finial.parent=group;
  return group;
}

function addBridge(scene:Scene,parent:TransformNode){
  const group=new TransformNode('QL-ArchBridge',scene);group.parent=parent;group.position.set(0,.2,-8.6);const stone=textured(scene,'QL-BridgeStone',asset('stone_albedo.png'),asset('stone_roughness.png'),asset('stone_normal.png'),5,.74,.02);const slabs=23;
  for(let i=0;i<slabs;i++){const t=i/(slabs-1),x=-8+t*16,y=Math.sin(t*Math.PI)*2.45;const slab=MeshBuilder.CreateBox('bridge-slab',{width:.82,height:.28,depth:4.2},scene);slab.material=stone;slab.position.set(x,y,0);slab.rotation.z=Math.cos(t*Math.PI)*-.12;slab.parent=group;if(i%2===0)for(const side of [-1,1]){const post=MeshBuilder.CreateCylinder('bridge-post',{diameterTop:.15,diameterBottom:.19,height:1.05,tessellation:10},scene);post.material=stone;post.position.set(x,y+.74,side*1.85);post.parent=group;}}
  for(const side of [-1,1])for(let i=0;i<22;i++){const t=(i+.5)/22,x=-7.65+t*15.3,y=.93+Math.sin(t*Math.PI)*2.45;const rail=MeshBuilder.CreateBox('bridge-rail',{width:.78,height:.14,depth:.14},scene);rail.material=stone;rail.position.set(x,y,side*1.85);rail.rotation.z=Math.cos(t*Math.PI)*-.11;rail.parent=group;}
  return group;
}

function addMapleTree(scene:Scene,parent:TransformNode,x:number,z:number,seed:number,scale:number,quality:Detail){
  const rnd=seeded(1200+seed*73),group=new TransformNode(`QL-Maple-${seed}`,scene);group.parent=parent;group.position.set(x,0,z);group.scaling.setAll(scale);const wood=textured(scene,'QL-TreeWood',asset('wood_albedo.png'),asset('wood_roughness.png'),asset('wood_normal.png'),3,.82,.01);
  const points=[new Vector3(0,0,0),new Vector3((rnd()-.5)*.45,1.6,(rnd()-.5)*.4),new Vector3((rnd()-.5)*.85,3.2,(rnd()-.5)*.75),new Vector3((rnd()-.5)*1.1,4.8,(rnd()-.5)*.95),new Vector3((rnd()-.5)*1.25,6,(rnd()-.5)*1.1)];const curve=Curve3.CreateCatmullRomSpline(points,28,false),trunkPoints=curve.getPoints();const trunk=MeshBuilder.CreateTube('maple-trunk',{path:trunkPoints,radius:.42,tessellation:10,cap:Mesh.CAP_ALL},scene);trunk.material=wood;trunk.parent=group;
  const ends:Vector3[]=[];for(let i=0;i<8;i++){const start=trunkPoints[Math.min(trunkPoints.length-1,Math.floor((.42+i*.06)*(trunkPoints.length-1)))].clone();const angle=i/8*Math.PI*2+rnd()*.7,len=2+rnd()*1.6,mid=start.add(new Vector3(Math.cos(angle)*len*.45,.55+rnd()*.8,Math.sin(angle)*len*.45)),end=start.add(new Vector3(Math.cos(angle)*len,1+rnd()*1.4,Math.sin(angle)*len));const branch=MeshBuilder.CreateTube('maple-branch',{path:Curve3.CreateCatmullRomSpline([start,mid,end],12,false).getPoints(),radius:.18,tessellation:7,cap:Mesh.CAP_ALL},scene);branch.material=wood;branch.parent=group;ends.push(end);}
  const leafTex=tex(scene,asset('maple_leaf.png'));leafTex.hasAlpha=true;const palettes=[XIANXIA_GRADIENTS.maple,XIANXIA_GRADIENTS.cherry,XIANXIA_GRADIENTS.jade] as const;const sources:Mesh[]=[];
  for(let p=0;p<3;p++){const mat=pbr(scene,`QL-Leaf-${p}`,'#FFFFFF',.72,0);mat.albedoTexture=leafTex;mat.useAlphaFromAlbedoTexture=true;mat.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;mat.alphaCutOff=.28;mat.backFaceCulling=false;mat.albedoColor=sampleXianxiaGradient(palettes[p],p===0?.58:p===1?.60:.52);const source=MeshBuilder.CreatePlane(`leaf-source-${p}`,{width:.72,height:1.02,sideOrientation:Mesh.DOUBLESIDE},scene);source.material=mat;source.isVisible=false;source.parent=group;sources.push(source);}
  const count=quality==='high'?220:quality==='balanced'?140:72;for(let i=0;i<count;i++){const anchor=ends[i%ends.length]??new Vector3(0,5,0),a=rnd()*Math.PI*2,r=.35+Math.pow(rnd(),.55)*2.25,p=rnd()<.12?1:rnd()>.82?2:0,leaf=sources[p].createInstance(`leaf-${seed}-${i}`);leaf.parent=group;leaf.position.copyFrom(anchor.add(new Vector3(Math.cos(a)*r,(rnd()-.3)*1.8,Math.sin(a)*r)));leaf.rotation.set(rnd()*Math.PI,rnd()*Math.PI,rnd()*Math.PI);leaf.scaling.setAll(.58+rnd()*.72);}
  return group;
}

export class XianxiaHeroGarden{
  readonly root:TransformNode;private water:WaterMaterial;private petals:InstancedMesh[]=[];private mist:Mesh[]=[];private detail:Detail;
  constructor(private scene:Scene,anchor:{x:number;z:number},detail:Detail='balanced'){
    this.detail=detail;this.root=new TransformNode('QL-HeroGarden',scene);this.root.position.set(anchor.x,heightAt(anchor.x,anchor.z),anchor.z);
    const grass=textured(scene,'QL-Grass',asset('grass_albedo.png'),asset('grass_roughness.png'),asset('grass_normal.png'),8,.88,0);const stone=textured(scene,'QL-Stone',asset('stone_albedo.png'),asset('stone_roughness.png'),asset('stone_normal.png'),5,.78,.02);
    const ground=MeshBuilder.CreateDisc('garden-ground',{radius:24,tessellation:96,sideOrientation:Mesh.DOUBLESIDE},scene);ground.rotation.x=Math.PI/2;ground.position.y=-.05;ground.material=grass;ground.parent=this.root;ground.receiveShadows=true;
    this.water=new WaterMaterial('QL-PondWater',scene,new Vector2(512,512));this.water.bumpTexture=tex(scene,asset('water_normal.png'),5,5);this.water.windForce=-4;this.water.waveHeight=.12;this.water.bumpHeight=.12;this.water.waveLength=.35;this.water.colorBlendFactor=.34;this.water.waterColor=Color3.FromHexString('#225D76');this.water.windDirection=new Vector3(.7,0,.3);
    const pond=MeshBuilder.CreateDisc('garden-pond',{radius:11,tessellation:96,sideOrientation:Mesh.DOUBLESIDE},scene);pond.rotation.x=Math.PI/2;pond.position.set(0,.04,-8.7);pond.material=this.water;pond.parent=this.root;
    addBridge(scene,this.root);addPavilion(scene,this.root,-15.7,-13.6,1.08);addPavilion(scene,this.root,17.2,-4,.9);
    const trees:[number,number,number,number][]=[[-12.5,-2.2,1,1.08],[10.2,-5,2,1.05],[14.7,-13.4,3,.98],[-18.5,-9.8,4,.96],[-5.4,-17.2,5,.9]];for(const t of trees)addMapleTree(scene,this.root,...t,detail);
    for(const [x,z,s] of [[-15,-1.5,1],[-8,-3.2,.72],[6.8,-2.1,.92],[18,-6.4,1.05],[13.6,-16.2,.9]] as const){const rock=MeshBuilder.CreateIcoSphere('garden-rock',{radius:1.3*s,subdivisions:2},scene);rock.material=stone;rock.position.set(x,.65,z);rock.scaling.set(1.4,.72,1);rock.rotation.set(.1,s*.7,.12);rock.parent=this.root;}
    const petalMat=pbr(scene,'QL-Petals','#E2A0A7',.72,.01);petalMat.alpha=.84;petalMat.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;petalMat.backFaceCulling=false;const source=MeshBuilder.CreatePlane('petal-source',{width:.18,height:.1,sideOrientation:Mesh.DOUBLESIDE},scene);source.material=petalMat;source.isVisible=false;source.parent=this.root;for(let i=0;i<34;i++){const inst=source.createInstance(`petal-${i}`);inst.parent=this.root;this.petals.push(inst);}
    const mistTexture=tex(scene,asset('mist.png'));mistTexture.hasAlpha=true;for(const [w,h,y,z] of [[15,4,.7,-8.5],[12,3.2,.8,-6.3],[17,3.8,.62,-12.2]] as const){const m=MeshBuilder.CreatePlane('garden-mist',{width:w,height:h,sideOrientation:Mesh.DOUBLESIDE},scene);const mm=pbr(scene,'QL-Mist','#DDE9EB',1,0);mm.albedoTexture=mistTexture;mm.opacityTexture=mistTexture;mm.alpha=.18;mm.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;mm.disableLighting=true;mm.emissiveColor=Color3.FromHexString('#B6CDD4');m.material=mm;m.rotation.x=Math.PI/2;m.position.set(0,y,z);m.parent=this.root;this.mist.push(m);}
    this.setDetail(detail);this.update(0);
  }
  addWaterRenderList(meshes:Mesh[]){for(const mesh of meshes)if(mesh!==undefined&&!this.water.renderList?.includes(mesh))this.water.addToRenderList(mesh);}
  update(time:number){for(let i=0;i<this.petals.length;i++){const p=this.petals[i],a=i/this.petals.length*Math.PI*2+time*.05*(1+i%3),r=4.8+(i%8)*1.45;p.position.set(Math.cos(a)*r,1.4+((i*.31+time*.12)%3.7),Math.sin(a)*r-8.6);p.rotation.set(time*.2+i,a,time*.13+i*.7);p.scaling.setAll(.8+(i%4)*.18);}for(let i=0;i<this.mist.length;i++){const m=this.mist[i];m.position.x=Math.sin(time*.12+i)*.8;m.position.y=.58+i*.08+Math.sin(time*.32+i)*.08;}}
  setDetail(detail:Detail){this.detail=detail;for(const p of this.petals)p.isVisible=detail!=='low';for(const m of this.mist)m.isVisible=detail!=='low';}
  get meshes(){return this.root.getChildMeshes(false) as Mesh[];}
  dispose(){this.root.dispose(false,true);this.water.dispose();}
}
