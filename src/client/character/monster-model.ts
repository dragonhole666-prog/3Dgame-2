import { Color3,Matrix,Mesh,MeshBuilder,PBRMaterial,Scene,SceneLoader,TransformNode,Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { Monster,MonsterDef } from '../../shared/types';
import { standardizeXianxiaMeshMaterials } from '../rendering/xianxia-visual-style';

const PLAYER_REFERENCE_HEIGHT=1.92;
export function monsterVisualHeight(def:MonsterDef){const fallback=1.85*def.scale;if(def.visualHeightRatio===undefined)return fallback;const ratio=def.aiProfile==='boss'?Math.max(2,Math.min(3,def.visualHeightRatio)):def.visualHeightRatio;return PLAYER_REFERENCE_HEIGHT*ratio;}
function pbr(scene:Scene,name:string,color:string,rough=.72,metal=.02){const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromHexString(color);m.roughness=rough;m.metallic=metal;m.environmentIntensity=.66;return m;}
function splitUrl(url:string){const i=url.lastIndexOf('/');return {root:url.slice(0,i+1),file:url.slice(i+1)};}

export interface HumanoidSkeletonFrame{height:number;groundY:number;centerX:number;centerZ:number;source:'skeleton'|'bounds';}
function localPoint(node:unknown,inverse:Matrix){const n=node as {getAbsolutePosition?:()=>Vector3};if(typeof n.getAbsolutePosition!=='function')return;return Vector3.TransformCoordinates(n.getAbsolutePosition(),inverse);}
function nameOf(node:unknown){return String((node as {name?:string}).name??'').toLowerCase();}
/** Measures a humanoid from named joints in holder-local space, avoiding giant imported mesh AABBs. */
export function measureHumanoidSkeletonFrame(holder:TransformNode):HumanoidSkeletonFrame|undefined{
 holder.computeWorldMatrix(true);const inverse=Matrix.Invert(holder.getWorldMatrix());const nodes=[holder,...holder.getDescendants(false)];
 const pick=(terms:string[])=>{for(const n of nodes){const name=nameOf(n);if(terms.some(t=>name.includes(t))){const p=localPoint(n,inverse);if(p)return p;}}};
 const top=pick(['headtop_end','headtop','head_end'])??pick(['head']);
 const left=pick(['lefttoebase','lefttoe','leftfoot']);const right=pick(['righttoebase','righttoe','rightfoot']);
 const hips=pick(['hips','pelvis']);
 if(!top||(!left&&!right))return;
 const feet=[left,right].filter(Boolean) as Vector3[];const groundY=Math.min(...feet.map(p=>p.y));const centerX=hips?.x??feet.reduce((a,p)=>a+p.x,0)/feet.length;const centerZ=hips?.z??feet.reduce((a,p)=>a+p.z,0)/feet.length;const height=top.y-groundY;
 return Number.isFinite(height)&&height>.05?{height,groundY,centerX,centerZ,source:'skeleton'}:undefined;
}
function measureMeshBounds(holder:TransformNode,meshes:readonly unknown[]):HumanoidSkeletonFrame|undefined{
 holder.computeWorldMatrix(true);const inverse=Matrix.Invert(holder.getWorldMatrix());let minY=Infinity,maxY=-Infinity,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const value of meshes){const m=value as Mesh;m.computeWorldMatrix?.(true);const b=m.getBoundingInfo?.()?.boundingBox;if(!b)continue;for(const p of [b.minimumWorld,b.maximumWorld]){const q=Vector3.TransformCoordinates(p,inverse);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minZ=Math.min(minZ,q.z);maxZ=Math.max(maxZ,q.z);}}
 const height=maxY-minY;if(!Number.isFinite(height)||height<=.05)return;return {height,groundY:minY,centerX:(minX+maxX)/2,centerZ:(minZ+maxZ)/2,source:'bounds'};
}

export class MonsterModel{
 readonly root:TransformNode;private body:TransformNode;private asset?:TransformNode;private disposed=false;private phase=0;
 constructor(private scene:Scene,public def:MonsterDef){this.root=new TransformNode(`Monster-${def.id}`,scene);this.body=new TransformNode('ProceduralMonster',scene);this.body.parent=this.root;this.buildFallback();const url=def.assetLocal||def.assetUrl;if(url&&url.startsWith('/'))void this.loadAsset(url);}
 private buildFallback(){const h=monsterVisualHeight(this.def),body=MeshBuilder.CreateCapsule('monster-body',{height:h*.64,radius:h*.18,tessellation:10},this.scene);body.position.y=h*.37;body.scaling.z=this.def.model==='snake'?1.65:1;body.material=pbr(this.scene,'monster-body-mat',this.def.color,.8,.01);body.parent=this.body;const head=MeshBuilder.CreateSphere('monster-head',{diameter:h*.30,segments:10},this.scene);head.position.set(0,h*.72,h*.11);head.material=pbr(this.scene,'monster-head-mat',this.def.color,.76,.01);head.parent=this.body;for(const side of [-1,1]){const eye=MeshBuilder.CreateSphere('monster-eye',{diameter:h*.035,segments:6},this.scene);const em=pbr(this.scene,'monster-eye-mat',this.def.vfx?'#BFA7F3':'#D8C18A',.2,.05);em.emissiveColor=em.albedoColor;em.emissiveIntensity=1.7;eye.material=em;eye.position.set(side*h*.07,h*.74,h*.235);eye.parent=this.body;}this.root.metadata={...(this.root.metadata??{}),shadowProxy:true};}
 private async loadAsset(url:string){try{const {root,file}=splitUrl(url),r=await SceneLoader.ImportMeshAsync(null,root,file,this.scene,undefined,'.glb');if(this.disposed){for(const m of r.meshes)m.dispose();return;}const holder=new TransformNode('MonsterAsset',this.scene);holder.parent=this.root;for(const m of r.meshes){if(!m.parent)m.parent=holder;if(m instanceof Mesh)standardizeXianxiaMeshMaterials(m,this.def.model==='golden-queen'?'cloth':'generic');}const frame=measureHumanoidSkeletonFrame(holder)??measureMeshBounds(holder,r.meshes);const target=monsterVisualHeight(this.def);if(frame){const scale=target/frame.height;holder.scaling.setAll(scale);holder.position.set(-frame.centerX*scale,-frame.groundY*scale,-frame.centerZ*scale);holder.metadata={...(holder.metadata??{}),fitSource:frame.source,fitHeight:frame.height};}this.body.setEnabled(false);this.asset=holder;}catch(e){console.warn('[BabylonMonster] asset fallback active',this.def.id,e);}}
 update(dt:number,time:number,actor?:Monster,speed=0){this.phase+=dt;const moving=Math.min(1,speed/5);const target=this.asset??this.body;target.position.y=Math.sin(time*(2.1+moving*4))*Math.min(.055,monsterVisualHeight(this.def)*.02)*(.3+moving);if(actor?.attack)target.rotation.z=Math.sin((time-actor.attack.started)*18)*.025;else target.rotation.z*=Math.exp(-dt*8);}
 dispose(){this.disposed=true;this.root.dispose(false,true);}
}
