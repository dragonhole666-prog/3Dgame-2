import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source=fs.readFileSync(path.join(process.cwd(),'src/shared/domains/navigation.ts'),'utf8');
describe('Babylon migration navigation boundary',()=>{
  it('keeps authoritative navigation renderer-independent',()=>{
    expect(source).toContain('class Heap');
    expect(source).toContain('function route');
    expect(source).toContain('groundStepAllowed');
    expect(source).not.toContain('@babylonjs/core');
    expect(source).not.toContain('@babylonjs/loaders');
  });
});
