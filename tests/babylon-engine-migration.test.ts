import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const oldName='th'+'ree';

describe('P0.27.1 Babylon-only engine boundary',()=>{
  it('uses Babylon packages as the only browser 3D runtime dependencies',()=>{
    const pkg=JSON.parse(read('package.json'));
    expect(pkg.dependencies['@babylonjs/core']).toBe('9.28.0');
    expect(pkg.dependencies['@babylonjs/loaders']).toBe('9.28.0');
    expect(pkg.dependencies['@babylonjs/materials']).toBe('9.28.0');
    const forbidden=[oldName,oldName+'-pathfinding',['@pixiv',oldName+'-vrm'].join('/'),'@types/'+oldName];
    for(const name of forbidden){expect(pkg.dependencies?.[name]).toBeUndefined();expect(pkg.devDependencies?.[name]).toBeUndefined();}
  });
  it('physically removes the former renderer source tree',()=>{
    expect(fs.existsSync(path.join(root,'src','legacy-'+'three'))).toBe(false);
  });
  it('contains no foreign renderer import in active TypeScript',()=>{
    const files=[...walk(path.join(root,'src')),...walk(path.join(root,'server'))].filter(f=>/\.(?:ts|tsx)$/.test(f));
    const source=files.map(readAbsolute=>fs.readFileSync(readAbsolute,'utf8')).join('\n');
    expect(source).not.toMatch(new RegExp(`from\\s+['\"]${oldName}(?:/[^'\"]*)?['\"]`));
    expect(source).not.toContain(['@pixiv',oldName+'-vrm'].join('/'));
    expect(source).not.toContain(oldName+'-pathfinding');
  });
});
