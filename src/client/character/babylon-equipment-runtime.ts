import {
  AbstractMesh,
  Bone,
  Mesh,
  Scene,
  SceneLoader,
  Skeleton,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { ItemInstance,Slot } from '../../shared/types';
import { canonicalBoneName } from './bone-names';
import { curatedEquipmentDefinition,type CuratedEquipmentDefinition } from './curated-equipment';
import { standardizeXianxiaMeshMaterials } from '../rendering/xianxia-visual-style';

function splitUrl(url:string){const i=url.lastIndexOf('/');return {root:url.slice(0,i+1),file:url.slice(i+1)};}

type BonePair={source:Bone;target:Bone};
type LoadedEquipment={slot:Slot;root:TransformNode;bonePairs:BonePair[];token:number};

const SLOT_SOCKET:Partial<Record<Slot,string[]>>={
  mainhand:['RightHand','J_Bip_R_Hand','mixamorig:RightHand','rightHand'],
  offhand:['LeftHand','J_Bip_L_Hand','mixamorig:LeftHand','leftHand'],
  head:['Head','J_Bip_C_Head','mixamorig:Head'],
  chest:['Chest','UpperChest','J_Bip_C_Chest','mixamorig:Spine2'],
  shoulders:['Chest','UpperChest','J_Bip_C_Chest','mixamorig:Spine2'],
  wrists:['RightHand','J_Bip_R_Hand','mixamorig:RightHand'],
  hands:['RightHand','J_Bip_R_Hand','mixamorig:RightHand'],
  waist:['Hips','J_Bip_C_Hips','mixamorig:Hips'],
  legs:['Hips','J_Bip_C_Hips','mixamorig:Hips'],
  feet:['Hips','J_Bip_C_Hips','mixamorig:Hips'],
  cape:['Chest','UpperChest','J_Bip_C_Chest','mixamorig:Spine2'],
  neck:['Chest','UpperChest','J_Bip_C_Chest','mixamorig:Spine2'],
  ring:['RightHand','J_Bip_R_Hand','mixamorig:RightHand'],
  charm:['Hips','J_Bip_C_Hips','mixamorig:Hips'],
  artifact:['Chest','UpperChest','J_Bip_C_Chest','mixamorig:Spine2'],
  back:['Chest','UpperChest','J_Bip_C_Chest','mixamorig:Spine2'],
  fashion:['Hips','J_Bip_C_Hips','mixamorig:Hips'],
};
const ATTACH_SOCKET:Record<NonNullable<CuratedEquipmentDefinition['attach']>,string[]>={
  rightHand:SLOT_SOCKET.mainhand!,leftHand:SLOT_SOCKET.offhand!,head:SLOT_SOCKET.head!,chest:SLOT_SOCKET.chest!,hips:SLOT_SOCKET.waist!,
};

function topRoots(nodes:(AbstractMesh|TransformNode)[]){const set=new Set(nodes);return nodes.filter(n=>!n.parent||!set.has(n.parent as AbstractMesh|TransformNode));}
function canonicalBoneMap(skeletons:Skeleton[]){
  const out=new Map<string,Bone>();
  for(const skeleton of skeletons)for(const bone of skeleton.bones){const key=canonicalBoneName(bone.name);if(key&&!out.has(key))out.set(key,bone);}
  return out;
}
function buildBonePairs(source:Skeleton[],target:Map<string,Bone>){
  const pairs:BonePair[]=[];
  for(const skeleton of source)for(const bone of skeleton.bones){const key=canonicalBoneName(bone.name),mapped=key?target.get(key):undefined;if(mapped)pairs.push({source:bone,target:mapped});}
  return pairs;
}
function semanticFor(slot:Slot){return slot==='mainhand'||slot==='offhand'||slot==='head'?'metal':slot==='cape'||slot==='fashion'||slot==='chest'||slot==='legs'||slot==='feet'||slot==='wrists'||slot==='hands'?'cloth':'stone';}
function sourceExtent(meshes:AbstractMesh[]){
  const min=new Vector3(Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY,Number.POSITIVE_INFINITY),max=new Vector3(Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY,Number.NEGATIVE_INFINITY);
  for(const mesh of meshes){mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo?.().boundingBox;if(!box)continue;min.minimizeInPlace(box.minimumWorld);max.maximizeInPlace(box.maximumWorld);}
  const size=max.subtract(min);return Number.isFinite(size.x+size.y+size.z)?size:Vector3.One();
}

/**
 * Single Babylon.js equipment runtime.
 *
 * Rigid props attach to Babylon transform sockets. Skinned garments retain their Babylon Skeleton
 * and mirror matched humanoid local bone matrices from the active avatar. There is no parallel
 * renderer, compatibility scene graph, or alternate animation engine.
 */
export class BabylonEquipmentRuntime{
  readonly root:TransformNode;
  private avatarRoot?:TransformNode;
  private targetBones=new Map<string,Bone>();
  private sockets=new Map<string,TransformNode>();
  private equipped=new Map<Slot,LoadedEquipment>();
  private slotTokens=new Map<Slot,number>();
  private serial=0;
  private disposed=false;

  constructor(private scene:Scene,parent:TransformNode){this.root=new TransformNode('QL-BabylonEquipmentRoot',scene);this.root.parent=parent;}

  bindAvatar(root:TransformNode,skeletons:Skeleton[]){
    this.avatarRoot=root;this.targetBones=canonicalBoneMap(skeletons);this.sockets.clear();
    for(const node of [root,...root.getDescendants(false)])if(node instanceof TransformNode||node instanceof AbstractMesh)this.sockets.set(node.name,node as TransformNode);
    for(const skeleton of skeletons)for(const bone of skeleton.bones){const node=bone.getTransformNode?.();if(node)this.sockets.set(bone.name,node);}
  }

  private socket(slot:Slot,attach?:CuratedEquipmentDefinition['attach']){
    const candidates=attach?ATTACH_SOCKET[attach]:(SLOT_SOCKET[slot]??[]);
    for(const name of candidates){const direct=this.sockets.get(name);if(direct)return direct;const lower=name.toLowerCase();for(const [n,node] of this.sockets)if(n.toLowerCase()===lower)return node;}
    return this.avatarRoot??this.root;
  }

  clear(slot?:Slot){
    if(slot){this.slotTokens.set(slot,++this.serial);const e=this.equipped.get(slot);e?.root.dispose(false,true);this.equipped.delete(slot);return;}
    this.serial++;for(const slotKey of this.equipped.keys())this.slotTokens.set(slotKey,this.serial);for(const e of this.equipped.values())e.root.dispose(false,true);this.equipped.clear();
  }

  async equip(slot:Slot,item:ItemInstance){
    this.clear(slot);const token=++this.serial;this.slotTokens.set(slot,token);
    const def=curatedEquipmentDefinition(item.baseId);const url=def?.url;
    if(!url||url.startsWith('generated-fit://'))return false;
    try{
      const {root,file}=splitUrl(url),result=await SceneLoader.ImportMeshAsync(null,root,file,this.scene,undefined,'.glb');
      if(this.disposed||this.slotTokens.get(slot)!==token){for(const m of result.meshes)m.dispose(false,true);for(const n of result.transformNodes)n.dispose(false,true);return false;}
      const extent=sourceExtent(result.meshes);
      const holder=new TransformNode(`QL-Equipment:${slot}:${item.baseId}`,this.scene);
      const nodes=[...result.transformNodes,...result.meshes];for(const node of topRoots(nodes))node.parent=holder;
      for(const mesh of result.meshes)if(mesh instanceof Mesh){standardizeXianxiaMeshMaterials(mesh,semanticFor(slot));mesh.receiveShadows=true;}
      const bonePairs=buildBonePairs(result.skeletons,this.targetBones),skinned=bonePairs.length>0;
      holder.parent=skinned?this.root:this.socket(slot,def?.attach);
      holder.position.setAll(0);holder.rotation.setAll(0);holder.scaling.setAll(def?.localScale??1);
      if(def?.localOffset)holder.position.set(...def.localOffset);
      if(def?.localRotation)holder.rotation.set(...def.localRotation);
      if(def?.targetLength){const longest=Math.max(extent.x,extent.y,extent.z,.001);holder.scaling.scaleInPlace(def.targetLength/longest);}
      else if(def?.targetSize){const longest=Math.max(extent.x,extent.y,extent.z,.001);holder.scaling.scaleInPlace(def.targetSize/longest);}
      if(def?.bladeAxis==='negativeY')holder.rotation.z+=Math.PI;
      this.equipped.set(slot,{slot,root:holder,bonePairs,token});return true;
    }catch(error){console.warn('[BabylonEquipment] asset load failed',slot,item.baseId,error);return false;}
  }

  async setEquipment(e:Partial<Record<Slot,ItemInstance>>){
    const slots=Object.keys(e) as Slot[],active=new Set(slots);
    for(const slot of [...this.equipped.keys()])if(!active.has(slot))this.clear(slot);
    await Promise.all(slots.map(slot=>e[slot]?this.equip(slot,e[slot]!):Promise.resolve(false)));
  }

  update(){
    for(const entry of this.equipped.values())for(const {source,target} of entry.bonePairs){
      const targetLocal=target.getLocalMatrix?.();if(!targetLocal)continue;
      const src=source as Bone&{setLocalMatrix?:(matrix:unknown)=>void};
      if(typeof src.updateMatrix==='function')src.updateMatrix(targetLocal,false,false);else src.setLocalMatrix?.(targetLocal);
    }
  }

  hasAsset(itemId:string){const url=curatedEquipmentDefinition(itemId)?.url;return !!url&&!url.startsWith('generated-fit://');}
  setEnabled(value:boolean){this.root.setEnabled(value);}
  dispose(){this.disposed=true;this.serial++;this.clear();this.root.dispose(false,true);}
}
