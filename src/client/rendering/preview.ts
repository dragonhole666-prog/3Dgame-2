import { ArcRotateCamera,Color3,Color4,Engine,HemisphericLight,DirectionalLight,Scene,Vector3 } from '@babylonjs/core';
import { Character } from '../character/character';
import { MonsterModel,monsterVisualHeight } from '../character/monster-model';
import type { CharacterCustomization } from '../character/customization';
import { CHARACTERS } from '../../shared/data/content';
import { createItem } from '../../shared/domains/item';
import { ITEMS } from '../../shared/data/equipment';
import type { ItemInstance,MonsterDef,Slot } from '../../shared/types';
import { CommercialLookDev } from './commercial-lookdev';
import { GRAPHICS_PRESETS } from '../core/graphics-settings';

export class ModelPreview{
 readonly canvas:HTMLCanvasElement;readonly engine:Engine;readonly scene:Scene;readonly camera:ArcRotateCamera;private lookdev:CommercialLookDev;character?:Character;monster?:MonsterModel;private observer:ResizeObserver;private time=0;
 constructor(public element:HTMLElement){
  this.canvas=document.createElement('canvas');this.canvas.style.width='100%';this.canvas.style.height='100%';this.element.append(this.canvas);this.engine=new Engine(this.canvas,true,{alpha:true,premultipliedAlpha:false});this.scene=new Scene(this.engine);this.scene.clearColor=new Color4(0,0,0,0);this.camera=new ArcRotateCamera('PreviewCamera',Math.PI*.55,Math.PI*.42,4.8,new Vector3(0,1,0),this.scene);this.camera.attachControl(this.canvas,true);this.camera.lowerRadiusLimit=1.6;this.camera.upperRadiusLimit=12;this.camera.panningSensibility=0;this.camera.wheelPrecision=55;
  this.lookdev=new CommercialLookDev(this.scene,this.camera,{...GRAPHICS_PRESETS.balanced,postProcessing:'light',shadows:false});this.lookdev.sun.intensity=2.1;this.lookdev.skyFill.intensity=.7;
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(element);this.resize();
 }
 resize(){this.engine.resize(true);this.lookdev.resize();}
 setCharacter(equipment:Partial<Record<Slot,ItemInstance>>,def=CHARACTERS[0],customization?:CharacterCustomization){this.monster?.dispose();this.monster=undefined;if(!this.character)this.character=new Character(this.scene,def);this.character.setEquipment(equipment);if(customization)this.character.setCustomization(customization);this.camera.target.set(0,1.05,0);this.camera.radius=4.7;}
 resetCharacter(def=CHARACTERS[0]){this.character?.dispose();this.character=undefined;const equipment:Partial<Record<Slot,ItemInstance>>={};for(const id of def.outfit){const slot=ITEMS[id]?.slot;if(slot){const item=createItem(id);item.identified=true;equipment[slot]=item;}}this.setCharacter(equipment,def);}
 setMonster(def:MonsterDef){this.character?.dispose();this.character=undefined;this.monster?.dispose();this.monster=new MonsterModel(this.scene,def);const h=monsterVisualHeight(def);this.camera.target.set(0,h*.48,0);this.camera.radius=Math.max(2.5,h*1.5);}
 update(dt:number,time:number){this.time=time;this.character?.update(dt,time);this.monster?.update(dt,time);this.lookdev.update(time);this.scene.render();}
 dispose(){this.observer.disconnect();this.character?.dispose();this.monster?.dispose();this.lookdev.dispose();this.scene.dispose();this.engine.dispose();this.canvas.remove();}
}
