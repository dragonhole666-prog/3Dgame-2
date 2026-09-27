import {
  AbstractMesh,
  Color3,
  Mesh,
  MultiMaterial,
  PBRMaterial,
  Scene,
  SubMesh,
  VertexBuffer,
  VertexData,
} from '@babylonjs/core';

/**
 * Commercial xianxia color system extracted from the supplied reference frame.
 *
 * The reference is not treated as a generic LUT. Surfaces are first separated
 * into semantic material families (water, foliage, wood, stone, metal, skin,
 * cloth), then the final image grade only performs density/hue finishing.
 */
export const XIANXIA_GRADIENTS={
  sky:['#183A4B','#2A556D','#7396AA','#D2E8F2'] as const,
  haze:['#203D49','#557588','#8EACBC','#D0E1E8'] as const,
  water:['#0E2938','#153B4E','#245E78','#397F99','#6AA2B7','#A8C9D6'] as const,
  shadow:['#141B20','#193543','#2E4B58','#556E77'] as const,
  jade:['#24342E','#3F5142','#5D6C55','#7C856D','#9DA183'] as const,
  maple:['#351D1B','#5B2E2A','#87423A','#A56152','#C67E61','#D9A38E'] as const,
  cherry:['#46262F','#713B49','#9A5965','#BF7985','#DDA8AF'] as const,
  wood:['#181918','#2F211D','#453129','#5F4135','#835A49'] as const,
  stone:['#242A2D','#3A4042','#5E5D55','#89847B','#B0A99D'] as const,
  antiqueGold:['#49351E','#73542E','#9C7744','#C69C5F','#E1C17B'] as const,
  highlight:['#AAC7D2','#DAE8E9','#F2ECE2'] as const,
  energy:['#1C576C','#3A8298','#77B5C4','#D3EDF2'] as const,
} as const;

export type XianxiaSurfaceSemantic=
  |'terrain-ground'|'terrain-water'|'terrain-stone'|'foliage'|'wood'
  |'metal'|'cloth'|'skin'|'stone'|'generic';

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const fract=(v:number)=>v-Math.floor(v);
const hash2=(x:number,z:number)=>fract(Math.sin(x*127.1+z*311.7)*43758.5453123);
const luminance=(r:number,g:number,b:number)=>r*.2126+g*.7152+b*.0722;
const distanceSq=(r:number,g:number,b:number,a:readonly [number,number,number])=>{const dr=r-a[0],dg=g-a[1],db=b-a[2];return dr*dr+dg*dg+db*db;};

const rgbToHsl=(r:number,g:number,b:number)=>{
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,l=(mx+mn)/2;
  if(d<1e-8)return {h:0,s:0,l};
  const s=d/(1-Math.abs(2*l-1));
  let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;
  h/=6;if(h<0)h+=1;return {h,s,l};
};
const hslToRgb=(h:number,s:number,l:number)=>{
  const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h*6)%2-1)),m=l-c/2;
  const k=Math.floor((h*6)%6);let r=0,g=0,b=0;
  if(k===0){r=c;g=x;}else if(k===1){r=x;g=c;}else if(k===2){g=c;b=x;}else if(k===3){g=x;b=c;}else if(k===4){r=x;b=c;}else{r=c;b=x;}
  return new Color3(r+m,g+m,b+m);
};

const gradientCache=new Map<readonly string[],Color3[]>();
function colors(stops:readonly string[]){let cached=gradientCache.get(stops);if(!cached){cached=stops.map(Color3.FromHexString);gradientCache.set(stops,cached);}return cached;}
export function sampleXianxiaGradient(stops:readonly string[],value:number,out=new Color3()){
  const c=colors(stops),t=clamp(value)*(c.length-1),i=Math.min(c.length-2,Math.floor(t)),f=t-i;
  out.r=c[i].r+(c[i+1].r-c[i].r)*f;out.g=c[i].g+(c[i+1].g-c[i].g)*f;out.b=c[i].b+(c[i+1].b-c[i].b)*f;return out;
}

const SOURCE_TERRAIN={
  darkGrass:[40/255,90/255,62/255] as const,
  lightGrass:[196/255,206/255,150/255] as const,
  water:[70/255,150/255,145/255] as const,
  stone:[126/255,122/255,117/255] as const,
  stoneLight:[146/255,144/255,142/255] as const,
  pale:[233/255,234/255,241/255] as const,
};
const SOURCE_FOREST={trunk:[92/255,62/255,42/255] as const,leaf:[36/255,82/255,56/255] as const};
function terrainClass(r:number,g:number,b:number){
  const rows:[number,readonly [number,number,number]][]=[[0,SOURCE_TERRAIN.darkGrass],[0,SOURCE_TERRAIN.lightGrass],[1,SOURCE_TERRAIN.water],[2,SOURCE_TERRAIN.stone],[2,SOURCE_TERRAIN.stoneLight],[2,SOURCE_TERRAIN.pale]];
  let cls=0,best=Infinity;for(const row of rows){const d=distanceSq(r,g,b,row[1]);if(d<best){best=d;cls=row[0];}}return cls;
}
function forestIsLeaf(r:number,g:number,b:number){return distanceSq(r,g,b,SOURCE_FOREST.leaf)<=distanceSq(r,g,b,SOURCE_FOREST.trunk);}

const PROFILES:Record<XianxiaSurfaceSemantic,{metallic:number;roughness:number;environmentIntensity:number}>= {
  'terrain-ground':{metallic:.0,roughness:.88,environmentIntensity:.54},
  'terrain-water':{metallic:.10,roughness:.10,environmentIntensity:1.75},
  'terrain-stone':{metallic:.02,roughness:.77,environmentIntensity:.62},
  foliage:{metallic:.0,roughness:.73,environmentIntensity:.52},
  wood:{metallic:.01,roughness:.79,environmentIntensity:.50},
  metal:{metallic:.72,roughness:.30,environmentIntensity:1.16},
  cloth:{metallic:.0,roughness:.77,environmentIntensity:.58},
  skin:{metallic:.0,roughness:.54,environmentIntensity:.70},
  stone:{metallic:.02,roughness:.72,environmentIntensity:.64},
  generic:{metallic:.05,roughness:.66,environmentIntensity:.72},
};

export function inferXianxiaSurfaceSemantic(name:string):XianxiaSurfaceSemantic{
  const n=name.toLowerCase();
  if(/water|lake|river|pond|pool|ocean|sea/.test(n))return 'terrain-water';
  if(/leaf|leaves|foliage|tree|grass|flower|plant|moss/.test(n))return 'foliage';
  if(/wood|trunk|branch|timber|bamboo/.test(n))return 'wood';
  if(/metal|steel|iron|gold|silver|bronze|blade|sword|spear|staff|shield|armor|armour|helm|crown|ring/.test(n))return 'metal';
  if(/stone|rock|cliff|wall|brick|tile|roof/.test(n))return 'stone';
  if(/cloth|fabric|robe|dress|shirt|pants|skirt|cape|sleeve|leather/.test(n))return 'cloth';
  if(/skin|face|body|hand|head/.test(n))return 'skin';
  return 'generic';
}

export function harmonizeXianxiaSurfaceColor(input:string|Color3,out=new Color3()){
  const source=typeof input==='string'?Color3.FromHexString(input):input;
  const hsl=rgbToHsl(source.r,source.g,source.b);if(hsl.s<.10){out.copyFrom(source);return out;}
  let target:readonly string[];
  if(hsl.h<.07||hsl.h>.94)target=XIANXIA_GRADIENTS.maple;
  else if(hsl.h<.17)target=XIANXIA_GRADIENTS.antiqueGold;
  else if(hsl.h<.46)target=XIANXIA_GRADIENTS.jade;
  else if(hsl.h<.70)target=XIANXIA_GRADIENTS.water;
  else if(hsl.h<.88)target=XIANXIA_GRADIENTS.cherry;
  else target=XIANXIA_GRADIENTS.maple;
  const sampled=sampleXianxiaGradient(target,clamp(.08+hsl.l*.72));const th=rgbToHsl(sampled.r,sampled.g,sampled.b);
  const final=hslToRgb(th.h,clamp(th.s*1.12,.28,.78),clamp(hsl.l*.46+th.l*.40,.08,.78));out.copyFrom(final);return out;
}

export function createXianxiaPbrMaterial(scene:Scene,semantic:XianxiaSurfaceSemantic,name:string=semantic){
  const p=PROFILES[semantic],m=new PBRMaterial(`QL-PBR:${name}`,scene);
  m.metallic=p.metallic;m.roughness=p.roughness;m.environmentIntensity=p.environmentIntensity;m.albedoColor=Color3.White();m.useRoughnessFromMetallicTextureAlpha=false;m.useRoughnessFromMetallicTextureGreen=true;
  if(semantic==='terrain-water'){m.emissiveColor=Color3.FromHexString('#082532');m.emissiveIntensity=.07;m.alpha=.97;m.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;}
  return m;
}

export function standardizeXianxiaMaterial(source:any,scene:Scene,semantic:XianxiaSurfaceSemantic=inferXianxiaSurfaceSemantic(source?.name??'')){
  const p=PROFILES[semantic],m=new PBRMaterial(`QL-PBR:${source?.name||semantic}`,scene);
  const sourceColor:Color3=source?.albedoColor??source?.diffuseColor??source?.baseColor??Color3.FromHexString('#D7D4CA');
  const harmonized=harmonizeXianxiaSurfaceColor(sourceColor);const blend=semantic==='skin'?.12:semantic==='generic'?.62:1;
  m.albedoColor=new Color3(sourceColor.r+(harmonized.r-sourceColor.r)*blend,sourceColor.g+(harmonized.g-sourceColor.g)*blend,sourceColor.b+(harmonized.b-sourceColor.b)*blend);
  m.albedoTexture=source?.albedoTexture??source?.diffuseTexture??null;m.bumpTexture=source?.bumpTexture??source?.normalTexture??null;m.ambientTexture=source?.ambientTexture??source?.occlusionTexture??null;m.emissiveTexture=source?.emissiveTexture??null;
  m.metallic=semantic==='generic'&&Number.isFinite(source?.metallic)?clamp(source.metallic,0,.78):p.metallic;
  m.roughness=semantic==='generic'&&Number.isFinite(source?.roughness)?clamp(source.roughness,.28,.88):p.roughness;
  m.environmentIntensity=p.environmentIntensity;m.alpha=Number.isFinite(source?.alpha)?source.alpha:1;m.backFaceCulling=source?.backFaceCulling??true;
  if(source?.emissiveColor)m.emissiveColor.copyFrom(source.emissiveColor);
  if(m.alpha<.999)m.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHABLEND;
  return m;
}

export function standardizeXianxiaMeshMaterials(mesh:Mesh,semantic?:XianxiaSurfaceSemantic){
  const source=mesh.material;
  if(source instanceof MultiMaterial){
    const mm=new MultiMaterial(`QL:${source.name}`,mesh.getScene());mm.subMaterials=source.subMaterials.map((m:any)=>m?standardizeXianxiaMaterial(m,mesh.getScene(),semantic??inferXianxiaSurfaceSemantic(`${mesh.name} ${m.name}`)):null);mesh.material=mm;
  }else if(source)mesh.material=standardizeXianxiaMaterial(source,mesh.getScene(),semantic??inferXianxiaSurfaceSemantic(`${mesh.name} ${source.name}`));
  mesh.receiveShadows=true;return mesh;
}

function ensureNormals(mesh:Mesh){
  if(mesh.isVerticesDataPresent(VertexBuffer.NormalKind))return;
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),indices=mesh.getIndices();if(!positions||!indices)return;
  const normals:number[]=[];VertexData.ComputeNormals(positions,indices,normals);mesh.setVerticesData(VertexBuffer.NormalKind,normals,true);
}
function readColor(colors:number[],i:number,stride:number){return [colors[i*stride]??1,colors[i*stride+1]??1,colors[i*stride+2]??1] as const;}
function regroupTriangles(mesh:Mesh,classes:Uint8Array,classCount:number){
  const source=Array.from(mesh.getIndices()??[],v=>Number(v));if(!source.length)return;
  const buckets:number[][]=Array.from({length:classCount},()=>[]);for(let i=0;i+2<source.length;i+=3){const a=source[i],b=source[i+1],c=source[i+2],ca=classes[a]??0,cb=classes[b]??0,cc=classes[c]??0,cls=ca===cb||ca===cc?ca:cb===cc?cb:ca;buckets[Math.min(classCount-1,cls)].push(a,b,c);}
  const merged:number[]=[];mesh.subMeshes=[];let start=0;const vertexCount=mesh.getTotalVertices();for(let i=0;i<classCount;i++){const bucket=buckets[i];if(!bucket.length)continue;merged.push(...bucket);new SubMesh(i,0,vertexCount,start,bucket.length,mesh);start+=bucket.length;}mesh.setIndices(merged,null,true);
}
function materialForWorld(scene:Scene,semantic:XianxiaSurfaceSemantic){const m=createXianxiaPbrMaterial(scene,semantic,`world:${semantic}`);m.albedoColor=Color3.White();return m;}

function styleTerrain(mesh:Mesh){
  ensureNormals(mesh);const positions=mesh.getVerticesData(VertexBuffer.PositionKind),sourceColors=mesh.getVerticesData(VertexBuffer.ColorKind);if(!positions||!sourceColors){mesh.material=materialForWorld(mesh.getScene(),'terrain-ground');return;}
  const count=mesh.getTotalVertices(),stride=sourceColors.length/count>=4?4:3,classes=new Uint8Array(count),rgb=new Float32Array(count*4),out=new Color3();let minY=Infinity,maxY=-Infinity;
  for(let i=0;i<count;i++){const y=positions[i*3+1];minY=Math.min(minY,y);maxY=Math.max(maxY,y);}const inv=1/Math.max(.001,maxY-minY);
  for(let i=0;i<count;i++){const [r,g,b]=readColor(sourceColors,i,stride),cls=terrainClass(r,g,b),height=(positions[i*3+1]-minY)*inv,lum=luminance(r,g,b);classes[i]=cls;if(cls===1)sampleXianxiaGradient(XIANXIA_GRADIENTS.water,.18+lum*.62+height*.12,out);else if(cls===2)sampleXianxiaGradient(XIANXIA_GRADIENTS.stone,.20+lum*.58+height*.18,out);else sampleXianxiaGradient(height<.09&&lum<.42?XIANXIA_GRADIENTS.shadow:XIANXIA_GRADIENTS.jade,.24+lum*.48+height*.28,out);rgb[i*4]=out.r;rgb[i*4+1]=out.g;rgb[i*4+2]=out.b;rgb[i*4+3]=1;}
  mesh.setVerticesData(VertexBuffer.ColorKind,Array.from(rgb),true,4);mesh.useVertexColors=true;mesh.hasVertexAlpha=false;regroupTriangles(mesh,classes,3);
  const mm=new MultiMaterial('QL-World:terrain',mesh.getScene());mm.subMaterials=[materialForWorld(mesh.getScene(),'terrain-ground'),materialForWorld(mesh.getScene(),'terrain-water'),materialForWorld(mesh.getScene(),'terrain-stone')];mesh.material=mm;mesh.receiveShadows=true;
}
function styleForest(mesh:Mesh){
  ensureNormals(mesh);const positions=mesh.getVerticesData(VertexBuffer.PositionKind),sourceColors=mesh.getVerticesData(VertexBuffer.ColorKind);if(!positions||!sourceColors){mesh.material=materialForWorld(mesh.getScene(),'foliage');return;}
  const count=mesh.getTotalVertices(),stride=sourceColors.length/count>=4?4:3,classes=new Uint8Array(count),rgb=new Float32Array(count*4),out=new Color3();let minY=Infinity,maxY=-Infinity;for(let i=0;i<count;i++){const y=positions[i*3+1];minY=Math.min(minY,y);maxY=Math.max(maxY,y);}const inv=1/Math.max(.001,maxY-minY);
  for(let i=0;i<count;i++){const [r,g,b]=readColor(sourceColors,i,stride),leaf=forestIsLeaf(r,g,b),height=(positions[i*3+1]-minY)*inv;classes[i]=leaf?1:0;const x=positions[i*3],z=positions[i*3+2],variant=hash2(Math.floor(x/5.5),Math.floor(z/5.5));if(leaf){const stops=variant<.08?XIANXIA_GRADIENTS.jade:variant>.74?XIANXIA_GRADIENTS.cherry:XIANXIA_GRADIENTS.maple;sampleXianxiaGradient(stops,.24+variant*.5+height*.24,out);}else sampleXianxiaGradient(XIANXIA_GRADIENTS.wood,.22+variant*.3+height*.28,out);rgb[i*4]=out.r;rgb[i*4+1]=out.g;rgb[i*4+2]=out.b;rgb[i*4+3]=1;}
  mesh.setVerticesData(VertexBuffer.ColorKind,Array.from(rgb),true,4);mesh.useVertexColors=true;mesh.hasVertexAlpha=false;regroupTriangles(mesh,classes,2);const mm=new MultiMaterial('QL-World:forest',mesh.getScene());mm.subMaterials=[materialForWorld(mesh.getScene(),'wood'),materialForWorld(mesh.getScene(),'foliage')];mesh.material=mm;mesh.receiveShadows=true;
}

export function applyXianxiaWorldArtDirection(mesh:AbstractMesh){if(!(mesh instanceof Mesh))return mesh;const name=`${mesh.name} ${mesh.parent?.name??''}`.toLowerCase();if(name.includes('terrain'))styleTerrain(mesh);else if(name.includes('forest'))styleForest(mesh);else standardizeXianxiaMeshMaterials(mesh);return mesh;}

export function profileForSemantic(semantic:XianxiaSurfaceSemantic){return {...PROFILES[semantic]};}
