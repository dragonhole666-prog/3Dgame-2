import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const failures=[];
const extensions=new Set(['.ts','.tsx','.js','.mjs','.cjs']);
const oldEngine='th'+'ree';
const forbiddenImports=[
  new RegExp(`from\\s+['\"]${oldEngine}(?:/[^'\"]*)?['\"]`),
  new RegExp(`import\\s+['\"]${oldEngine}(?:/[^'\"]*)?['\"]`),
  new RegExp(['@pixiv',oldEngine+'-vrm'].join('/')),
  new RegExp(oldEngine+'-pathfinding'),
];
function scan(target){
  if(!fs.existsSync(target))return;
  const stat=fs.statSync(target);
  if(stat.isDirectory()){for(const name of fs.readdirSync(target))scan(path.join(target,name));return;}
  if(!extensions.has(path.extname(target)))return;
  const text=fs.readFileSync(target,'utf8');
  for(const pattern of forbiddenImports)if(pattern.test(text))failures.push(`${path.relative(root,target)} contains forbidden renderer import: ${pattern}`);
}
for(const dir of ['src','server'])scan(path.join(root,dir));
const legacyPath=path.join(root,'src','legacy-'+oldEngine);
if(fs.existsSync(legacyPath))failures.push('former renderer source directory still exists');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
for(const name of [oldEngine,oldEngine+'-pathfinding',['@pixiv',oldEngine+'-vrm'].join('/'),'@types/'+oldEngine])if(pkg.dependencies?.[name]||pkg.devDependencies?.[name])failures.push(`package.json contains forbidden dependency ${name}`);
for(const required of ['@babylonjs/core','@babylonjs/loaders','@babylonjs/materials'])if(!pkg.dependencies?.[required])failures.push(`missing Babylon dependency ${required}`);
const requiredFiles=[
  'src/client/core/game.ts',
  'src/client/character/character.ts',
  'src/client/character/babylon-character-animation-runtime.ts',
  'src/client/character/babylon-equipment-runtime.ts',
  'src/client/character/babylon-expression-runtime.ts',
  'src/client/character/monster-model.ts',
  'src/client/world/world-renderer.ts',
  'src/client/rendering/commercial-lookdev.ts',
  'src/client/rendering/cinematic-rendering-pipeline.ts',
  'src/client/rendering/xianxia-visual-style.ts',
];
for(const rel of requiredFiles)if(!fs.existsSync(path.join(root,rel)))failures.push(`missing Babylon runtime file ${rel}`);
if(failures.length){console.error('[FAIL] Babylon-only runtime gate');for(const failure of failures)console.error(' - '+failure);process.exit(1);}
console.log('[PASS] Babylon-only runtime: former renderer source removed, no foreign renderer imports/dependencies, required Babylon modules present.');
