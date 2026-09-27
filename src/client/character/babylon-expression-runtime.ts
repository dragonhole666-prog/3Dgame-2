import { AbstractMesh,MorphTarget } from '@babylonjs/core';
import type { PublicPlayer } from '../../shared/types';

type ExpressionKey='blink'|'angry'|'sorrow';
const ALIASES:Record<ExpressionKey,string[]>={
  blink:['blink','eyeclose','eyesclosed','blinkleft','blinkright'],
  angry:['angry','anger','mad'],
  sorrow:['sorrow','sad','sadness'],
};
const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]/g,'');

/** Babylon MorphTarget expression state machine for GLB/VRM-compatible avatars. */
export class BabylonExpressionRuntime{
  private targets:Record<ExpressionKey,MorphTarget[]>={blink:[],angry:[],sorrow:[]};
  private t=0;private nextBlink=.8;private blinkPhase=-1;
  bind(meshes:AbstractMesh[]){
    this.targets={blink:[],angry:[],sorrow:[]};
    const seen=new Set<MorphTarget>();
    for(const mesh of meshes){const manager=(mesh as any).morphTargetManager;if(!manager)continue;for(let i=0;i<manager.numTargets;i++){const target=manager.getTarget(i) as MorphTarget|undefined;if(!target||seen.has(target))continue;seen.add(target);const n=norm(target.name);for(const key of Object.keys(ALIASES) as ExpressionKey[])if(ALIASES[key].some(x=>n.includes(x))){this.targets[key].push(target);break;}}}
  }
  private set(key:ExpressionKey,value:number){const v=Math.max(0,Math.min(1,value));for(const t of this.targets[key])t.influence=v;}
  update(dt:number,time:number,actor?:PublicPlayer){
    this.t+=dt;if(this.blinkPhase<0&&this.t>=this.nextBlink){this.blinkPhase=0;this.nextBlink=this.t+2.4+Math.random()*2.8;}
    let blink=0;if(this.blinkPhase>=0){this.blinkPhase+=dt;const p=this.blinkPhase/.16;blink=p<.5?p*2:(1-p)*2;if(p>=1)this.blinkPhase=-1;}
    const dead=!!actor&&actor.hp<=0,hit=!!actor&&actor.staggerUntil>time,combat=!!actor&&(actor.state==='Combat'||!!actor.attack);
    this.set('blink',blink);this.set('angry',dead?0:(combat ? .18 : 0));this.set('sorrow',dead ? .42 : hit ? .25 : 0);
  }
  reset(){this.set('blink',0);this.set('angry',0);this.set('sorrow',0);}
  dispose(){this.reset();this.targets={blink:[],angry:[],sorrow:[]};}
}
