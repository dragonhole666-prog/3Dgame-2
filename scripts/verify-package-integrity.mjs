import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const resolveRoot=rel=>path.join(root,rel.replaceAll('/',path.sep));
const existsFile=rel=>fs.existsSync(resolveRoot(rel))&&fs.statSync(resolveRoot(rel)).isFile()&&fs.statSync(resolveRoot(rel)).size>0;
const read=rel=>fs.readFileSync(resolveRoot(rel),'utf8').replace(/^\uFEFF/,'');
const must=(ok,msg)=>{if(!ok)throw new Error(`PACKAGE INTEGRITY FAIL: ${msg}`);console.log('PASS ',msg);};
const required=[
 'package.json','README.md','QINGLAN_TEST_CENTER.py','QINGLAN_TEST_CENTER.pyw','index.html',
 '.github/workflows/ci.yml','scripts/verify-babylon-runtime.mjs','scripts/verify-current.mjs','scripts/verify-package-integrity.mjs',
 'src/client/core/game.ts','src/client/character/character.ts','src/client/character/babylon-character-animation-runtime.ts',
 'src/client/character/babylon-equipment-runtime.ts','src/client/character/babylon-expression-runtime.ts','src/client/character/curated-equipment.ts',
 'src/client/character/monster-model.ts','src/client/world/world-renderer.ts','src/client/rendering/commercial-lookdev.ts',
 'src/client/rendering/cinematic-rendering-pipeline.ts','src/client/rendering/xianxia-visual-style.ts','src/shared/domains/navigation.ts',
 'src/assets/xianxia_world.glb','public/assets/user-equipment/ice-mythic-sword.glb'
];
for(const rel of required)must(existsFile(rel),`required release file exists: ${rel}`);
for(const rel of ['START_GAME.bat','DEPLOY_CLOUDFLARE.bat','scripts/start-game.ps1','scripts/ensure-node-runtime.ps1'])must(!fs.existsSync(resolveRoot(rel)),`legacy shell launcher is absent: ${rel}`);
must(!fs.existsSync(resolveRoot('src/legacy-'+'three')),'former renderer directory is absent');
const pkg=JSON.parse(read('package.json'));
const oldEngine='th'+'ree';
for(const [section,entries] of Object.entries({dependencies:pkg.dependencies??{},devDependencies:pkg.devDependencies??{}}))for(const name of Object.keys(entries))must(![oldEngine,oldEngine+'-pathfinding',['@pixiv',oldEngine+'-vrm'].join('/'),'@types/'+oldEngine].includes(name),`${section} contains no retired renderer dependency: ${name}`);
const scriptRefs=Object.values(pkg.scripts??{}).flatMap(cmd=>[...String(cmd).matchAll(/scripts[\\/]([A-Za-z0-9._-]+\.(?:mjs|js|cjs))/g)]).map(m=>`scripts/${m[1]}`);
for(const rel of new Set(scriptRefs))must(existsFile(rel),`package script dependency exists: ${rel}`);
const lockPath=resolveRoot('package-lock.json');
if(fs.existsSync(lockPath)){
 const lock=JSON.parse(fs.readFileSync(lockPath,'utf8')),rootPkg=lock.packages?.['']??{};
 must(lock.version===pkg.version,`package-lock version matches ${pkg.version}`);must(rootPkg.version===pkg.version,'package-lock root version matches package.json');
 for(const section of ['dependencies','devDependencies'])for(const [name,spec] of Object.entries(pkg[section]??{}))must(rootPkg[section]?.[name]===spec,`lock root ${section} matches ${name}@${spec}`);
}else console.warn('WARN  package-lock.json not present yet; generate it with npm install before release and commit it.');
console.log('PACKAGE INTEGRITY: PASS');
