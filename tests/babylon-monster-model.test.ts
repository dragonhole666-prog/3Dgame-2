import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {MONSTERS} from '../src/shared/data/monsters';
import {monsterVisualHeight} from '../src/client/character/monster-model';

describe('Babylon monster model sizing',()=>{
  it('uses skeleton-first height calibration for imported humanoid bosses',()=>{
    const source=fs.readFileSync(path.join(process.cwd(),'src/client/character/monster-model.ts'),'utf8');
    expect(source).toContain('measureHumanoidSkeletonFrame(holder)??measureMeshBounds');
    expect(source).toContain("SceneLoader.ImportMeshAsync");
    expect(monsterVisualHeight(MONSTERS['golden-queen'])).toBeGreaterThan(3.8);
  });
});
