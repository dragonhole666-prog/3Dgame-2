import type { WeaponProfile } from '../../shared/types';
import type { AuthoredPoseSpec,ReadyPoseSpec } from './combat-animation-types';
import { WEAPON_ANIMATION_PROFILES } from './weapon-animation-profiles';

/**
 * Babylon-only weapon presentation data.
 *
 * Pose data is kept engine-agnostic. Babylon AnimationGroup playback/blending is handled by
 * BabylonCharacterAnimationRuntime; no renderer-specific math or foreign scene graph is stored here.
 */
export type ReadySpec=ReadyPoseSpec;
export type CombatStanceSpec=AuthoredPoseSpec;

export const ACTION_RPG_READY:Readonly<Record<WeaponProfile,ReadySpec>>=Object.fromEntries(
  (Object.entries(WEAPON_ANIMATION_PROFILES) as [WeaponProfile,(typeof WEAPON_ANIMATION_PROFILES)[WeaponProfile]][])
    .map(([profile,data])=>[profile,data.stance.ready]),
) as Record<WeaponProfile,ReadySpec>;

export const ACTION_RPG_COMBAT_STANCE:Readonly<Record<WeaponProfile,CombatStanceSpec>>=Object.fromEntries(
  (Object.entries(WEAPON_ANIMATION_PROFILES) as [WeaponProfile,(typeof WEAPON_ANIMATION_PROFILES)[WeaponProfile]][])
    .map(([profile,data])=>[profile,data.stance.engaged]),
) as Record<WeaponProfile,CombatStanceSpec>;

export interface BabylonWeaponLayerWeights{
  ready:number;
  combat:number;
  locomotion:number;
}

export function weaponLayerWeights(profile:WeaponProfile,{moving,combat}:{moving:number;combat:boolean}):BabylonWeaponLayerWeights{
  const p=ACTION_RPG_READY[profile],c=ACTION_RPG_COMBAT_STANCE[profile];
  const move=Math.max(0,Math.min(1,moving));
  const locomotion=1;
  const ready=(p.idleWeight+(p.moveWeight-p.idleWeight)*move)*(combat?0:1);
  const combatWeight=c.sourceBlend*(combat?1:0);
  return {ready:Math.max(0,Math.min(1,ready)),combat:Math.max(0,Math.min(1,combatWeight)),locomotion};
}
