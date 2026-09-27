import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {curatedEquipmentDefinition} from '../src/client/character/curated-equipment';

const read=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
describe('Babylon character runtime',()=>{
  it('owns avatar, animation, expression and equipment through Babylon modules',()=>{
    const source=read('src/client/character/character.ts');
    expect(source).toContain('BabylonCharacterAnimationRuntime');
    expect(source).toContain('BabylonEquipmentRuntime');
    expect(source).toContain('BabylonExpressionRuntime');
    expect(source).toContain('SceneLoader.ImportMeshAsync');
  });
  it('resolves authored GLB equipment without an alternate renderer bridge',()=>{
    expect(curatedEquipmentDefinition('mythic-sword')?.url).toBe('/assets/user-equipment/ice-mythic-sword.glb');
    expect(curatedEquipmentDefinition('heavenfall-bow')?.attach).toBe('leftHand');
    const runtime=read('src/client/character/babylon-equipment-runtime.ts');
    expect(runtime).toContain('SceneLoader.ImportMeshAsync');
    expect(runtime).toContain('curatedEquipmentDefinition');
    expect(runtime).toContain('getTransformNode');
  });
});
