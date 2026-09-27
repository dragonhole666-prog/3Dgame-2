import {
  AbstractMesh,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  ShaderMaterial,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
  Effect,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { WORLD,heightAt } from '../../shared/data/world';
import { XIANXIA_MAP } from '../../shared/data/xianxia-world-map';
import { XianxiaHorizon } from './xianxia-horizon';
import { XianxiaHeroGarden } from './xianxia-hero-garden';
import { XianxiaCinematicAtmosphere } from './xianxia-cinematic-atmosphere';
import { XIANXIA_GRADIENTS,applyXianxiaWorldArtDirection,sampleXianxiaGradient } from '../rendering/xianxia-visual-style';
import type { CommercialLookDev } from '../rendering/commercial-lookdev';

type Detail='low'|'balanced'|'high';

const SKY_VERT=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vP;void main(){vP=position;gl_Position=worldViewProjection*vec4(position,1.0);}`;
const SKY_FRAG=`precision highp float;varying vec3 vP;void main(){float h=clamp(normalize(vP).y*.5+.5,0.,1.);vec3 zen=vec3(.58,.79,.88);vec3 mid=vec3(.76,.86,.87);vec3 hor=vec3(.91,.84,.73);vec3 c=mix(hor,mid,smoothstep(.08,.48,h));c=mix(c,zen,smoothstep(.50,.94,h));float warm=pow(1.-abs(normalize(vP).y),5.);c+=vec3(.10,.035,.01)*warm;gl_FragColor=vec4(c,1.);}`;
Effect.ShadersStore['qinglanSkyVertexShader']=SKY_VERT;
Effect.ShadersStore['qinglanSkyFragmentShader']=SKY_FRAG;

function buildTerrain(scene:Scene,name:string,visible:boolean){
  const width=XIANXIA_MAP.maxX-XIANXIA_MAP.minX,depth=XIANXIA_MAP.maxZ-XIANXIA_MAP.minZ;
  const subdivisions=Math.max(2,Math.min(255,Math.max(XIANXIA_MAP.columns-1,XIANXIA_MAP.rows-1)));
  const mesh=MeshBuilder.CreateGround(name,{width,height:depth,subdivisions,updatable:true},scene);
  const cx=(XIANXIA_MAP.minX+XIANXIA_MAP.maxX)/2,cz=(XIANXIA_MAP.minZ+XIANXIA_MAP.maxZ)/2;
  mesh.position.set(cx,0,cz);
  const pos=mesh.getVerticesData(VertexBuffer.PositionKind)!;
  let minY=Infinity,maxY=-Infinity;
  for(let i=0;i<pos.length;i+=3){const wx=pos[i]+cx,wz=pos[i+2]+cz,y=heightAt(wx,wz);pos[i+1]=y;minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  mesh.updateVerticesData(VertexBuffer.PositionKind,pos,false,false);
  const indices=mesh.getIndices()!,normals=new Array<number>(pos.length).fill(0);VertexData.ComputeNormals(pos,indices,normals);mesh.setVerticesData(VertexBuffer.NormalKind,normals,true);
  if(visible){
    const colors=new Array<number>((pos.length/3)*4),c=new Color3(),inv=1/Math.max(.001,maxY-minY);
    for(let i=0;i<pos.length;i+=3){const n=(pos[i+1]-minY)*inv,variation=(Math.sin((pos[i]+cx)*.071)+Math.cos((pos[i+2]+cz)*.083)+2)*.07;sampleXianxiaGradient(n>.64?XIANXIA_GRADIENTS.stone:XIANXIA_GRADIENTS.jade,Math.max(0,Math.min(1,.18+n*.62+variation)),c);const j=i/3*4;colors[j]=c.r;colors[j+1]=c.g;colors[j+2]=c.b;colors[j+3]=1;}mesh.setVerticesData(VertexBuffer.ColorKind,colors,true,4);
    const mat=new PBRMaterial('QL-FallbackTerrain-PBR',scene);mat.albedoColor=Color3.White();mat.roughness=.91;mat.metallic=.01;mat.environmentIntensity=.58;mesh.useVertexColors=true;mesh.material=mat;mesh.receiveShadows=true;
  }else{mesh.isVisible=true;mesh.visibility=0;}
  mesh.isPickable=true;return mesh;
}

function createSky(scene:Scene){
  const sky=MeshBuilder.CreateSphere('QL-GradientSky',{diameter:1100,segments:24,sideOrientation:Mesh.BACKSIDE},scene);sky.isPickable=false;sky.infiniteDistance=true;
  const mat=new ShaderMaterial('QL-GradientSkyMaterial',scene,{vertex:'qinglanSky',fragment:'qinglanSky'},{attributes:['position'],uniforms:['worldViewProjection']});mat.backFaceCulling=false;mat.disableDepthWrite=true;sky.material=mat;return sky;
}

export class WorldRenderer{
  readonly root:TransformNode;
  readonly terrain:Mesh;
  readonly collision:AbstractMesh[]=[];
  private fallbackTerrain:Mesh;
  private heroGarden:XianxiaHeroGarden;
  private atmosphere:XianxiaCinematicAtmosphere;
  private horizon:XianxiaHorizon;
  private primaryMeshes:Mesh[]=[];
  private primaryRoot?:TransformNode;
  private detail:Detail;
  private loaded=false;
  constructor(private scene:Scene,initialDetail:Detail='balanced',private lookdev?:CommercialLookDev){
    this.detail=initialDetail;this.root=new TransformNode('QL-WorldRoot',scene);createSky(scene).parent=this.root;
    this.terrain=buildTerrain(scene,'QL-AuthoritativeTerrainRaycast',false);this.terrain.parent=this.root;this.collision.push(this.terrain);
    this.fallbackTerrain=buildTerrain(scene,'QL-VisibleTerrainFallback',true);this.fallbackTerrain.parent=this.root;
    this.heroGarden=new XianxiaHeroGarden(scene,{x:WORLD.spawn.x,z:WORLD.spawn.z},initialDetail);this.heroGarden.root.parent=this.root;
    this.atmosphere=new XianxiaCinematicAtmosphere(scene,{x:WORLD.spawn.x,z:WORLD.spawn.z},initialDetail);this.atmosphere.root.parent=this.root;
    this.horizon=new XianxiaHorizon(scene,initialDetail);this.horizon.root.parent=this.root;
    void this.loadPrimaryWorld();
  }
  private async loadPrimaryWorld(){
    try{
      const result=await SceneLoader.ImportMeshAsync(null,'/assets/user-world/','xianxia_world.glb',this.scene,undefined,'.glb');
      const holder=new TransformNode('QL-PrimaryWorld',this.scene);holder.parent=this.root;this.primaryRoot=holder;
      for(const m of result.meshes){if(!(m instanceof Mesh))continue;m.parent=holder;m.isPickable=true;m.receiveShadows=true;applyXianxiaWorldArtDirection(m);this.primaryMeshes.push(m);this.collision.push(m);if(this.lookdev)this.lookdev.registerShadowCaster(m);}
      if(!this.primaryMeshes.length)throw new Error('GLB 未包含可渲染 Mesh');
      this.fallbackTerrain.setEnabled(false);this.loaded=true;this.heroGarden.addWaterRenderList(this.primaryMeshes);
      if(this.lookdev){const env=[...this.primaryMeshes,...this.heroGarden.meshes].filter((m):m is Mesh=>m instanceof Mesh);this.lookdev.createStaticReflectionProbe(env);}
      window.dispatchEvent(new CustomEvent('qinglan-map-ready'));
    }catch(error){this.loaded=false;this.fallbackTerrain.setEnabled(true);console.error('[BabylonWorld] xianxia_world.glb load failed',error);window.dispatchEvent(new CustomEvent('qinglan-map-error',{detail:String(error)}));}
  }
  update(_position:{x:number;z:number},time:number){this.heroGarden.update(time);this.atmosphere.update(time);this.horizon.update(time);}
  setHighDetailAssets(enabled:boolean){this.setModelDetail(enabled?this.detail:'low');}
  setModelDetail(detail:Detail){this.detail=detail;this.heroGarden.setDetail(detail);this.atmosphere.setDetail(detail);this.horizon.setDetail(detail);for(const mesh of this.primaryMeshes)mesh.alwaysSelectAsActiveMesh=detail==='high';}
  setVegetationQuality(quality:'off'|'low'|'full'){if(quality==='off')this.heroGarden.setDetail('low');else this.heroGarden.setDetail(quality==='full'?this.detail:'balanced');}
  setChunkRadius(_radius:number){}
  get loadedChunks(){return this.loaded?1:0;}
  allVisibleMeshes(){return this.scene.meshes.filter((m):m is Mesh=>m instanceof Mesh&&m.isVisible&&m.isEnabled());}
  dispose(){this.primaryRoot?.dispose(false,true);this.horizon.dispose();this.atmosphere.dispose();this.heroGarden.dispose();this.terrain.dispose(false,true);this.fallbackTerrain.dispose(false,true);this.root.dispose(false,true);}
}
