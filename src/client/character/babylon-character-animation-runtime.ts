import { AnimationGroup } from '@babylonjs/core';
import type { AttackState,PublicPlayer,WeaponProfile } from '../../shared/types';
import { basicComboClips,combatBlendFor,resolveCombatMotionClip } from './combat-animation-resolver';
import { combatMotionSpec } from './weapon-animation-profiles';
import type { HumanoidClip } from './combat-animation-types';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,'');

type LoopState='idle'|'walk'|'run';

/**
 * Babylon.js animation coordinator.
 *
 * It owns only Babylon AnimationGroups and data-driven combat clip selection. No alternate scene
 * graph, animation mixer or foreign engine type is allowed into the character runtime.
 */
export class BabylonCharacterAnimationRuntime{
  private groups=new Map<string,AnimationGroup>();
  private currentLoop?:AnimationGroup;
  private currentOneShot?:AnimationGroup;
  private loopState:LoopState='idle';
  private lastAttackId=-1;
  private basicCombo=0;
  private lastBasicComboAt=-Infinity;
  private disposed=false;

  constructor(private profile:WeaponProfile='sword',groups:AnimationGroup[]=[]){this.replaceGroups(groups);}

  replaceGroups(groups:AnimationGroup[]){
    this.stopAll();this.groups.clear();
    for(const g of groups){g.stop();this.groups.set(norm(g.name),g);}
    this.currentLoop=undefined;this.currentOneShot=undefined;this.loopState='idle';
  }
  setWeaponProfile(profile:WeaponProfile){if(this.profile!==profile){this.profile=profile;this.basicCombo=0;this.lastBasicComboAt=-Infinity;}}
  private find(name:string){
    const key=norm(name),exact=this.groups.get(key);if(exact)return exact;
    for(const [n,g] of this.groups)if(n.includes(key)||key.includes(n))return g;
    return undefined;
  }
  private playLoop(name:HumanoidClip,state:LoopState,speedRatio=1){
    const g=this.find(name);if(!g)return false;
    if(this.currentLoop!==g){this.currentLoop?.stop();g.start(true,speedRatio,g.from,g.to,false);this.currentLoop=g;}
    else g.speedRatio=speedRatio;
    this.loopState=state;return true;
  }
  private playOneShot(name:HumanoidClip,speedRatio=1){
    const g=this.find(name);if(!g)return false;
    if(this.currentOneShot&&this.currentOneShot!==g)this.currentOneShot.stop();
    g.stop();g.start(false,speedRatio,g.from,g.to,false);this.currentOneShot=g;return true;
  }
  preview(name:string){const g=this.find(name);if(!g)return false;this.stopAll();g.start(false,1,g.from,g.to,false);this.currentOneShot=g;return true;}
  predictAttack(skillId:string,now:number){
    const clips=basicComboClips(this.profile),isBasic=skillId==='basic';
    let clip:HumanoidClip|undefined;
    if(isBasic){if(now-this.lastBasicComboAt>1.05)this.basicCombo=0;clip=clips[this.basicCombo%clips.length];this.basicCombo=(this.basicCombo+1)%clips.length;this.lastBasicComboAt=now;}
    else clip=resolveCombatMotionClip(this.profile,skillId,undefined);
    return clip?this.playOneShot(clip):false;
  }
  private attackClip(a:AttackState){
    if(a.skill==='basic'){
      const clips=basicComboClips(this.profile);return clips[Math.max(0,(a.id-1)%clips.length)];
    }
    return resolveCombatMotionClip(this.profile,a.skill,undefined);
  }
  update(dt:number,time:number,actor?:PublicPlayer,speed=0){
    if(this.disposed)return;
    const moving=Math.max(0,speed),running=moving>4.6;
    if(actor?.attack&&actor.attack.id!==this.lastAttackId){const clip=this.attackClip(actor.attack);if(clip)this.playOneShot(clip);this.lastAttackId=actor.attack.id;}
    if(actor?.hp!==undefined&&actor.hp<=0){this.playLoop('Death','idle',1);return;}
    if(this.currentOneShot?.isPlaying){const attack=actor?.attack,clip=attack?this.attackClip(attack):undefined;if(attack&&clip){const spec=combatMotionSpec(clip);if(spec){const duration=Math.max(.001,attack.endsAt-attack.started),phase=clamp((time-attack.started)/duration);const authoredHit=clamp(spec.timing.hitPhase,.05,.95);this.currentOneShot.speedRatio=phase<authoredHit ? .98 : 1.02;}}return;}
    const desired:LoopState=moving<.08?'idle':running?'run':'walk';
    if(desired==='idle')this.playLoop('Idle','idle',1);
    else if(desired==='run')this.playLoop('Run','run',clamp(moving/6.4,.72,1.4));
    else this.playLoop('Walk','walk',clamp(moving/3.8,.68,1.35));
    void dt;
  }
  get state(){return {loop:this.loopState,oneShot:this.currentOneShot?.name??null,profile:this.profile,blend:combatBlendFor(this.profile)};}
  stopAll(){for(const g of this.groups.values())g.stop();}
  dispose(){this.disposed=true;this.stopAll();this.groups.clear();}
}
