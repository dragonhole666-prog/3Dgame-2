import type { Appearance, Slot } from '../../shared/types';
import { APPEARANCES, ITEMS } from '../../shared/data/equipment';
import { EQUIPMENT_FIT_MODULES } from '../../shared/data/equipment-fit-modules.generated';
import { BODY_FIT_SLOTS, isBodyFitSlot } from './garment-fit-standard';

export type BaseOutfitMask='top'|'tie'|'bottom'|'shoes';
export type CuratedEquipmentSource='project-authored'|'user-supplied'|'generated-fit'|'auto-module';
export type CuratedEquipmentMode='skinned'|'rigid'|'generated-skinned'|'auto-fit';

export interface CuratedEquipmentDefinition {
  itemId:string;
  slot:Slot;
  url:string;
  mode:CuratedEquipmentMode;
  source:CuratedEquipmentSource;
  baseMask?:BaseOutfitMask[];
  targetLength?:number;
  targetSize?:number;
  fitMode?:'weapon'|'center';
  gripMode?:'end'|'center';
  bladeAxis?:'positiveY'|'negativeY';
  /** HF9 imported weapons normalize their longest source axis to the held +Y axis. */
  autoOrientWeapon?:boolean;
  attach?:'rightHand'|'leftHand'|'head'|'chest'|'hips';
  localOffset?:readonly [number,number,number];
  localRotation?:readonly [number,number,number];
  localScale?:number;
  /** Defensive props: holder origin is the physical hand grip, while the plate is offset away from the palm. */
  shieldGrip?:{handleLength:number;handleRadius:number;plateOffset:number};
  /** HF8: another validated garment GLB can be reused as a slot-fit template. */
  templateItemId?:string;
  /** HF8: template/generated pieces inherit the gameplay item's authored palette. */
  tintFromItem?:boolean;
  /**
   * HF14 fit safety mode.
   * Existing project garments were authored against the Qinglan humanoid rest pose and already
   * rendered correctly before HF6.  Keep their authored rest geometry and only remap bone indices;
   * imported/custom garments can still opt into full bind-pose transfer.
   */
  fitStrategy?:'preserve-authored'|'bind-transfer'|'anatomical-transfer';
}

/**
 * Babylon-only semantic equipment asset registry.
 *
 * Important: this is intentionally conservative. A model is listed only when its actual geometry
 * matches the gameplay item category. Uploaded files whose filename lies about the geometry are
 * never allowed into this table.
 */
const DEFINITIONS:Record<string,CuratedEquipmentDefinition>={
  // Real project-authored garments. These files were already bundled but the VRM runtime previously
  // ignored them and drew procedural primitives instead.
  'linen-robe':{itemId:'linen-robe',slot:'chest',url:'/assets/equipment/linen_robe.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['top','tie','bottom']},
  'cloud-robe':{itemId:'cloud-robe',slot:'chest',url:'/assets/equipment/cloud_robe.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['top','tie','bottom']},
  'thunder-armor':{itemId:'thunder-armor',slot:'chest',url:'/assets/equipment/thunder_armor.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['top','tie','bottom']},
  'snow-fashion':{itemId:'snow-fashion',slot:'fashion',url:'/assets/equipment/snow_fashion.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['top','tie','bottom']},
  'linen-legs':{itemId:'linen-legs',slot:'legs',url:'/assets/equipment/linen_legs.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['bottom']},
  'scale-legs':{itemId:'scale-legs',slot:'legs',url:'/assets/equipment/scale_legs.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['bottom']},
  'linen-boots':{itemId:'linen-boots',slot:'feet',url:'/assets/equipment/linen_boots.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['shoes']},
  'cloud-boots':{itemId:'cloud-boots',slot:'feet',url:'/assets/equipment/cloud_boots.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['shoes']},
  'thunder-boots':{itemId:'thunder-boots',slot:'feet',url:'/assets/equipment/thunder_boots.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer',baseMask:['shoes']},
  'cloth-wrists':{itemId:'cloth-wrists',slot:'wrists',url:'/assets/equipment/cloth_wrists.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer'},
  'thunder-bracers':{itemId:'thunder-bracers',slot:'wrists',url:'/assets/equipment/thunder_bracers.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer'},
  'woven-belt':{itemId:'woven-belt',slot:'waist',url:'/assets/equipment/woven_belt.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer'},
  'thunder-belt':{itemId:'thunder-belt',slot:'waist',url:'/assets/equipment/thunder_belt.glb',mode:'skinned',source:'project-authored',fitStrategy:'anatomical-transfer'},

  // Rigid authored head pieces.
  'cloth-head':{itemId:'cloth-head',slot:'head',url:'/assets/equipment/cloth_head.glb',mode:'rigid',source:'project-authored',attach:'head'},
  'jade-crown':{itemId:'jade-crown',slot:'head',url:'/assets/equipment/jade_crown.glb',mode:'rigid',source:'project-authored',attach:'head'},

  // Correct sword models. The bundled sword mesh points blade-down in source coordinates, so it is
  // explicitly flipped into the anatomical palm +Y direction. This does NOT alter combat animation.
  'iron-sword':{itemId:'iron-sword',slot:'mainhand',url:'/assets/equipment/iron_sword.glb',mode:'rigid',source:'project-authored',attach:'rightHand',targetLength:1.05,bladeAxis:'negativeY'},
  'thunder-sword':{itemId:'thunder-sword',slot:'mainhand',url:'/assets/equipment/thunder_sword.glb',mode:'rigid',source:'project-authored',attach:'rightHand',targetLength:1.45,bladeAxis:'negativeY'},
  'heaven-sword':{itemId:'heaven-sword',slot:'mainhand',url:'/assets/equipment/heaven_sword.glb',mode:'rigid',source:'project-authored',attach:'rightHand',targetLength:1.65,bladeAxis:'negativeY'},
  'bamboo-sword':{itemId:'bamboo-sword',slot:'mainhand',url:'/assets/equipment/qinglan_immortal_jian.glb',mode:'rigid',source:'project-authored',attach:'rightHand',targetLength:1.18,bladeAxis:'negativeY'},
  'cloud-sword':{itemId:'cloud-sword',slot:'mainhand',url:'/assets/equipment/qinglan_immortal_jian.glb',mode:'rigid',source:'project-authored',attach:'rightHand',targetLength:1.32,bladeAxis:'negativeY'},

  // User-supplied ice sword. Geometry inspection confirms a single rigid sword mesh with the blade
  // extending along local +Y; the grip sits at the negative-Y end. Keep gameplay identity unchanged.
  'mythic-sword':{itemId:'mythic-sword',slot:'mainhand',url:'/assets/user-equipment/ice-mythic-sword.glb',mode:'rigid',source:'user-supplied',attach:'rightHand',targetLength:1.72,bladeAxis:'positiveY'},


  // User-supplied equipment. Center-fit is used for wearable/defensive props;
  // weapons are normalized independently so source authoring scale does not leak into gameplay.
  'primordial-god-crown':{itemId:'primordial-god-crown',slot:'head',url:'/assets/user-equipment/divine_helmet.glb',mode:'rigid',source:'user-supplied',attach:'head',fitMode:'center',targetSize:.46,localRotation:[0,Math.PI,0],localOffset:[0,.08,0]},
  'heavenfall-bow':{itemId:'heavenfall-bow',slot:'mainhand',url:'/assets/user-equipment/mythic_demon_bow.glb',mode:'rigid',source:'user-supplied',attach:'leftHand',targetLength:1.58,gripMode:'center',bladeAxis:'positiveY'},
  'celestial-burial-spear':{itemId:'celestial-burial-spear',slot:'mainhand',url:'/assets/user-equipment/mythic_demon_spear.glb',mode:'rigid',source:'user-supplied',attach:'rightHand',targetLength:2.35,gripMode:'end',bladeAxis:'positiveY'},
  'demon-king-shield':{itemId:'demon-king-shield',slot:'offhand',url:'/assets/user-equipment/demon_king_shield.glb',mode:'rigid',source:'user-supplied',attach:'leftHand',fitMode:'center',targetSize:.78,localRotation:[0,Math.PI/2,0],shieldGrip:{handleLength:.24,handleRadius:.026,plateOffset:.105}},
};

/** Body silhouette slots never fall back to primitive boxes/cylinders in the Babylon runtime. */
export const NO_PROCEDURAL_SILHOUETTE=new Set<Slot>(['head','shoulders','chest','wrists','hands','waist','legs','feet','cape','fashion']);

export const FIT_REQUIRED_SLOTS=BODY_FIT_SLOTS;

const FIT_TEMPLATE_BY_SLOT:Partial<Record<Slot,Readonly<Record<string,string>>>>={
  chest:{plate:'thunder-armor',lamellar:'thunder-armor',vest:'linen-robe',robe:'linen-robe',silk:'cloud-robe',default:'linen-robe'},
  fashion:{default:'snow-fashion'},
  wrists:{scale:'thunder-bracers',plate:'thunder-bracers',fang:'thunder-bracers',wrap:'cloth-wrists',default:'cloth-wrists'},
  waist:{plate:'thunder-belt',sash:'woven-belt',default:'woven-belt'},
  legs:{plate:'scale-legs',lamellar:'scale-legs',cloth:'linen-legs',default:'linen-legs'},
  feet:{spiked:'thunder-boots',boots:'cloud-boots',shoes:'linen-boots',plate:'thunder-boots',default:'cloud-boots'},
};
const GENERATED_SKINNED_SLOTS=new Set<Slot>(['shoulders','hands','cape']);
const BASE_MASK_BY_SLOT:Partial<Record<Slot,BaseOutfitMask[]>>={fashion:['top','tie','bottom'],legs:['bottom'],feet:['shoes']};
function fitBaseMask(slot:Slot,ap:Appearance,template?:CuratedEquipmentDefinition):BaseOutfitMask[]|undefined{
  if(slot==='chest')return ap.length>=.76||['plate','lamellar','robe','silk'].includes(ap.shape)?['top','tie','bottom']:['top','tie'];
  return BASE_MASK_BY_SLOT[slot]??template?.baseMask;
}

function appearanceFor(itemId:string){const item=ITEMS[itemId];return item?.appearanceId?APPEARANCES[item.appearanceId]:undefined;}
function explicitGlbUrl(itemId:string){
  const item=ITEMS[itemId],ap=appearanceFor(itemId);
  const moduleUrl=EQUIPMENT_FIT_MODULES[itemId];if(moduleUrl)return moduleUrl;
  for(const value of [item?.mesh,ap?.mesh])if(typeof value==='string'&&/\.glb(?:[?#].*)?$/i.test(value))return value;
  return undefined;
}
function automaticGlbFitDefinition(itemId:string):CuratedEquipmentDefinition|undefined{
  const item=ITEMS[itemId],ap=appearanceFor(itemId);if(!item?.slot||!ap)return undefined;
  const url=explicitGlbUrl(itemId);if(!url)return undefined;
  if(isBodyFitSlot(item.slot))return {itemId,slot:item.slot,url,mode:'auto-fit',source:'auto-module',baseMask:fitBaseMask(item.slot,ap),tintFromItem:false};
  const attach=item.slot==='mainhand'?(ap.animationProfile==='bow'?'leftHand':'rightHand'):item.slot==='offhand'?'leftHand':item.slot==='head'?'head':item.slot==='waist'||item.slot==='charm'?'hips':'chest';
  if(item.slot==='mainhand')return {itemId,slot:item.slot,url,mode:'rigid',source:'auto-module',attach,targetLength:ap.length,gripMode:ap.animationProfile==='bow'?'center':'end',bladeAxis:'positiveY',autoOrientWeapon:true};
  if(item.slot==='offhand')return {itemId,slot:item.slot,url,mode:'rigid',source:'auto-module',attach,fitMode:'center',targetSize:Math.max(.18,ap.length),localRotation:ap.shape==='shield'?[0,Math.PI/2,0]:undefined};
  return {itemId,slot:item.slot,url,mode:'rigid',source:'auto-module',attach,fitMode:'center',targetSize:Math.max(.05,Math.min(1.4,ap.length))};
}
function generatedFitDefinition(itemId:string):CuratedEquipmentDefinition|undefined{
  const item=ITEMS[itemId],ap=appearanceFor(itemId);if(!item?.slot||!ap||!FIT_REQUIRED_SLOTS.has(item.slot))return undefined;
  const slot=item.slot;if(GENERATED_SKINNED_SLOTS.has(slot))return {itemId,slot,url:`generated-fit://${itemId}`,mode:'generated-skinned',source:'generated-fit',baseMask:fitBaseMask(slot,ap),tintFromItem:true};
  const byShape=FIT_TEMPLATE_BY_SLOT[slot],templateItemId=byShape?.[ap.shape]??byShape?.default;if(!templateItemId)return undefined;
  const template=DEFINITIONS[templateItemId];if(!template||template.mode!=='skinned')return undefined;
  return {itemId,slot,url:template.url,mode:'skinned',source:'generated-fit',baseMask:fitBaseMask(slot,ap,template),templateItemId,tintFromItem:true,fitStrategy:template.fitStrategy};
}

/** Resolution order: preserve hand-tuned authored assets; editor/module item ids auto-resolve; template/generated fit is metadata-only until a Babylon fit adapter is available. */
export function curatedEquipmentDefinition(itemId:string){return DEFINITIONS[itemId]??automaticGlbFitDefinition(itemId)??generatedFitDefinition(itemId);}
export function curatedEquipmentIds(){return [...new Set([...Object.keys(DEFINITIONS),...Object.keys(ITEMS).filter(id=>!!generatedFitDefinition(id))])];}
export function fittedGarmentIds(){return Object.keys(ITEMS).filter(id=>{const slot=ITEMS[id]?.slot;return !!slot&&FIT_REQUIRED_SLOTS.has(slot);});}
