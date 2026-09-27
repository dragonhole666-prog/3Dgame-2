import { ArcRotateCamera,Engine,Scene,Vector3 } from '@babylonjs/core';
import type { ContentPack } from '../shared/data/content';
import { applyContent } from '../shared/data/content';
import { heightAt } from '../shared/data/world';
import { WorldRenderer } from '../client/world/world-renderer';
import { MonsterModel } from '../client/character/monster-model';
import { CommercialLookDev } from '../client/rendering/commercial-lookdev';
import { GRAPHICS_PRESETS } from '../client/core/graphics-settings';
export class EditorMapView{
 private canvas:HTMLCanvasElement;private engine:Engine;private scene:Scene;private camera:ArcRotateCamera;private lookdev:CommercialLookDev;private world:WorldRenderer;private observer:ResizeObserver;private models:MonsterModel[]=[];
 constructor(private host:HTMLElement,content:ContentPack){applyContent(content);this.canvas=document.createElement('canvas');this.canvas.style.width='100%';this.canvas.style.height='100%';host.append(this.canvas);this.engine=new Engine(this.canvas,true,{premultipliedAlpha:false});this.scene=new Scene(this.engine);this.camera=new ArcRotateCamera('EditorCamera',Math.PI*.82,Math.PI*.34,210,new Vector3(0,15,0),this.scene);this.camera.lowerRadiusLimit=10;this.camera.upperRadiusLimit=350;this.camera.upperBetaLimit=Math.PI*.49;this.camera.attachControl(this.canvas,true);this.lookdev=new CommercialLookDev(this.scene,this.camera,{...GRAPHICS_PRESETS.balanced,postProcessing:'light'});this.world=new WorldRenderer(this.scene,'balanced',this.lookdev);for(const o of content.objects.filter(o=>o.kind==='monster')){const def=content.monsters[o.monsterId!];if(!def)continue;const m=new MonsterModel(this.scene,def);m.root.position.set(o.x,heightAt(o.x,o.z),o.z);m.root.rotation.y=o.rotation;this.models.push(m);}this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();}
 resize(){this.engine.resize(true);this.lookdev.resize();}
 update(dt:number,time:number){this.world.update({x:this.camera.target.x,z:this.camera.target.z},time);for(const m of this.models)m.update(dt,time);this.lookdev.update(time);this.scene.render();}
 dispose(){this.observer.disconnect();for(const m of this.models)m.dispose();this.world.dispose();this.lookdev.dispose();this.scene.dispose();this.engine.dispose();this.canvas.remove();}
}
