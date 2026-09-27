import {
  AbstractMesh,
  AnimationGroup,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  SceneLoader,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { ItemInstance,PublicPlayer,Rarity,Slot,WeaponProfile } from '../../shared/types';
import { APPEARANCES,ITEMS } from '../../shared/data/equipment';
import { CHARACTERS,type CharacterDefinition } from '../../shared/data/content';
import { avatarCandidate,getAvatarCandidate,type AvatarCandidateId } from './avatar-candidates';
import type { CharacterCustomization } from './customization';
import { standardizeXianxiaMeshMaterials } from '../rendering/xianxia-visual-style';
import { BabylonCharacterAnimationRuntime } from './babylon-character-animation-runtime';
import { BabylonEquipmentRuntime } from './babylon-equipment-runtime';
import { BabylonExpressionRuntime } from './babylon-expression-runtime';

function splitUrl(url:string){const i=url.lastIndexOf('/');return {root:url.slice(0,i+1),file:url.slice(i+1)};}
function mat(scene:Scene,name:string,color:string,rough=.58,metal=.03){const m=new PBRMaterial(name,scene);m.albedoColor=Color3.FromHexString(color);m.roughness=rough;m.metallic=metal;m.environmentIntensity=.72;return m;}
function visualEquipmentKey(e:Partial<Record<Slot,ItemInstance>>){
  return (Object.keys(e) as Slot[]).sort().map(slot=>`${slot}:${e[slot]?.baseId??''}`).join('|');
}
function customizationKey(c:CharacterCustomization){return JSON.stringify(c);}

export class Character{
  readonly root:TransformNode;
  profile:WeaponProfile='sword';
  ready=false;failed=false;
  private modelRoot?:TransformNode;private animations:AnimationGroup[]=[];private animationRuntime=new BabylonCharacterAnimationRuntime('sword');private expressionRuntime=new BabylonExpressionRuntime();private equipmentRoot:TransformNode;private equipmentRuntime:BabylonEquipmentRuntime;private flightRig:TransformNode;private avatar:AvatarCandidateId;private equipmentVisible=true;private disposed=false;private equipment:Partial<Record<Slot,ItemInstance>>={};private equipmentVisualKey='';private custom?:CharacterCustomization;private customVisualKey='';private proceduralPhase=0;private rightHand?:TransformNode;
  constructor(private scene:Scene,def:CharacterDefinition=CHARACTERS[0],private mode:'player'|'npc'='player',candidate?:AvatarCandidateId){
    this.root=new TransformNode('QL-Character',scene);this.root.scaling.set(def.build,def.height,def.build);this.avatar=candidate??getAvatarCandidate();
    this.equipmentRoot=new TransformNode('QL-EquipmentFallback',scene);this.equipmentRoot.parent=this.root;this.equipmentRuntime=new BabylonEquipmentRuntime(scene,this.root);
    this.flightRig=new TransformNode('QL-FlightRig',scene);this.flightRig.parent=this.root;this.flightRig.setEnabled(false);this.createFlightRig();
    void this.loadAvatar(this.avatar);
  }
  private createFlightRig(){const sword=MeshBuilder.CreateBox('QL-FlightSword',{width:.12,height:.06,depth:2.2,bevel:0.02} as any,this.scene);sword.material=mat(this.scene,'QL-FlightSwordMat','#9CBFC5',.24,.68);sword.position.set(0,.04,.18);sword.parent=this.flightRig;const glow=MeshBuilder.CreateTorus('QL-FlightAura',{diameter:1.05,thickness:.035,tessellation:36},this.scene);const gm=mat(this.scene,'QL-FlightAuraMat','#80D7D1',.3,.05);gm.emissiveColor=Color3.FromHexString('#4FA8A7');gm.emissiveIntensity=1.3;gm.alpha=.48;gm.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;glow.material=gm;glow.rotation.x=Math.PI/2;glow.parent=this.flightRig;}
  private async loadAvatar(id:AvatarCandidateId){
    const old=this.modelRoot;const holder=new TransformNode(`QL-Avatar-${id}`,this.scene);holder.parent=this.root;holder.setEnabled(false);this.modelRoot=holder;
    try{const url=avatarCandidate(id).url,{root,file}=splitUrl(url);const r=await SceneLoader.ImportMeshAsync(null,root,file,this.scene,undefined,'.glb');if(this.disposed){for(const m of r.meshes)m.dispose();holder.dispose();return;}
      for(const node of [...r.transformNodes,...r.meshes]){if(node.parent===null||r.meshes.includes(node as AbstractMesh)&&!(node.parent&&r.meshes.includes(node.parent as AbstractMesh)))node.parent=holder;}
      this.animations=r.animationGroups;this.animationRuntime.replaceGroups(this.animations);this.expressionRuntime.bind(r.meshes);for(const m of r.meshes)if(m instanceof Mesh){standardizeXianxiaMeshMaterials(m,'cloth');m.receiveShadows=true;}
      this.findHumanoidAnchors(holder);this.normalizeAvatar(holder,r.meshes);this.equipmentRuntime.bindAvatar(holder,r.skeletons);holder.setEnabled(true);this.ready=true;this.failed=false;old?.dispose(false,true);this.rebuildEquipment();this.applyCustomization();
    }catch(error){console.error('[BabylonCharacter] avatar load failed',id,error);holder.dispose(false,true);if(this.modelRoot===holder)this.modelRoot=undefined;this.failed=true;this.ready=false;this.createFallback();}
  }
  private normalizeAvatar(holder:TransformNode,meshes:AbstractMesh[]){
    let minY=Infinity,maxY=-Infinity;for(const m of meshes){m.computeWorldMatrix(true);const bi=m.getBoundingInfo?.();if(!bi)continue;minY=Math.min(minY,bi.boundingBox.minimumWorld.y);maxY=Math.max(maxY,bi.boundingBox.maximumWorld.y);}const h=maxY-minY;if(Number.isFinite(h)&&h>.1){const s=1.88/h;holder.scaling.setAll(s);holder.position.y=-minY*s;}
  }
  private findHumanoidAnchors(holder:TransformNode){this.rightHand=undefined;const names=['J_Bip_R_Hand','RightHand','mixamorig:RightHand','rightHand'];for(const n of names){const x=this.scene.getTransformNodeByName(n);if(x&&x.isDescendantOf(holder)){this.rightHand=x;break;}}}
  private createFallback(){if(this.root.getChildTransformNodes(false).some(x=>x.name==='QL-CharacterFallback'))return;const g=new TransformNode('QL-CharacterFallback',this.scene);g.parent=this.root;const body=MeshBuilder.CreateCapsule('QL-FallbackBody',{height:1.72,radius:.28,tessellation:12},this.scene);body.position.y=.86;body.material=mat(this.scene,'QL-FallbackBodyMat',this.mode==='npc'?'#879B96':'#8FA7A2',.82,.01);body.parent=g;const head=MeshBuilder.CreateSphere('QL-FallbackHead',{diameter:.42,segments:12},this.scene);head.position.y=1.78;head.material=mat(this.scene,'QL-FallbackSkin','#D7B79D',.72,0);head.parent=g;this.rightHand=new TransformNode('RightHand',this.scene);this.rightHand.position.set(-.34,1.12,.02);this.rightHand.parent=g;}
  private equipmentProfile(e:Partial<Record<Slot,ItemInstance>>):WeaponProfile{const item=e.mainhand??e.offhand;const app=item?APPEARANCES[ITEMS[item.baseId]?.appearanceId??'']:undefined;return app?.animationProfile??'sword';}
  private rebuildEquipment(){
    this.equipmentRoot.getChildMeshes(false).forEach(m=>m.dispose(false,true));
    this.profile=this.equipmentProfile(this.equipment);this.animationRuntime.setWeaponProfile(this.profile);
    this.equipmentRuntime.setEnabled(this.equipmentVisible);
    if(this.equipmentVisible)void this.equipmentRuntime.setEquipment(this.equipment);else this.equipmentRuntime.clear();
    const item=this.equipment.mainhand??this.equipment.offhand;if(!item||!this.equipmentVisible)return;
    if(this.equipmentRuntime.hasAsset(item.baseId))return;
    const weapon=MeshBuilder.CreateBox('QL-WeaponFallback',{width:.08,height:.08,depth:this.profile==='greatsword'?1.65:1.25},this.scene);
    weapon.material=mat(this.scene,'QL-WeaponFallbackMat','#B8C2C1',.28,.72);weapon.rotation.x=Math.PI/2;weapon.position.set(0,0,.62);weapon.parent=this.rightHand??this.equipmentRoot;
  }
  private applyCustomization(){if(!this.custom)return;const c=this.custom;const sx=.92+(c.shoulderWidth??50)/500,sy=.95+(c.height??50)/1000;this.modelRoot?.scaling.set(sx,sy,sx);}
  setAvatarCandidate(id:AvatarCandidateId,_def:CharacterDefinition=CHARACTERS[0]){if(id===this.avatar)return;this.avatar=id;void this.loadAvatar(id);}
  setCustomization(c:CharacterCustomization){const key=customizationKey(c);if(key===this.customVisualKey)return;this.customVisualKey=key;this.custom={...c};this.applyCustomization();}
  setEquipmentVisible(v:boolean){this.equipmentVisible=v;this.equipmentRoot.setEnabled(v);this.equipmentRuntime.setEnabled(v);if(v)this.rebuildEquipment();else this.equipmentRuntime.clear();}
  setEquipment(e:Partial<Record<Slot,ItemInstance>>){const key=visualEquipmentKey(e);if(key===this.equipmentVisualKey)return;this.equipmentVisualKey=key;this.equipment={...e};this.rebuildEquipment();}
  previewAnimation(name:string){if(this.animationRuntime.preview(name))return true;const key=name.toLowerCase();this.proceduralPhase=key.includes('attack')?10:key.includes('run')?20:1;return true;}
  predictAttack(skill:string,now:number){this.proceduralPhase=10;return this.animationRuntime.predictAttack(skill,now)||true;}
  playPickup(_itemId:string,_rarity:Rarity,_now:number,_mode?:string){this.proceduralPhase=30;}
  update(dt:number,time:number,actor?:PublicPlayer,speed=0){this.animationRuntime.update(dt,time,actor,speed);this.expressionRuntime.update(dt,time,actor);this.equipmentRuntime.update();this.flightRig.setEnabled(!!actor?.flight);if(actor?.flight){this.flightRig.position.y=Math.sin(time*3.3)*.045;this.flightRig.rotation.y=time*.18;}const moving=Math.min(1,speed/5);this.proceduralPhase=Math.max(0,this.proceduralPhase-dt*5);if(this.modelRoot){const bob=moving*Math.sin(time*10)*.018+(this.proceduralPhase>0?Math.sin(time*18)*.01:0);this.modelRoot.position.y=bob;}}
  dispose(){this.disposed=true;this.animationRuntime.dispose();this.expressionRuntime.dispose();this.equipmentRuntime.dispose();for(const a of this.animations)a.stop();this.root.dispose(false,true);}
}
