import { groundStepAllowed,walkable } from '../data/world';
import { XIANXIA_MAP,xianxiaAreaClear } from '../data/xianxia-world-map';
import { distance,type Vec2 } from '../types';

const STEP=2.5,MIN=XIANXIA_MAP.playableMin+2,MAX=XIANXIA_MAP.playableMax-2;
interface Cell{x:number;z:number;ix:number;iz:number}
const cells=new Map<string,Cell>();let ready=false;
const key=(ix:number,iz:number)=>`${ix}:${iz}`;
function ensureGrid(){if(ready)return;const nx=Math.floor((MAX-MIN)/STEP);for(let ix=0;ix<=nx;ix++)for(let iz=0;iz<=nx;iz++){const x=MIN+ix*STEP,z=MIN+iz*STEP,half=STEP*.44;if(!xianxiaAreaClear(x-half,x+half,z-half,z+half,.65))continue;const p={x,z};if(!walkable(p,.65))continue;cells.set(key(ix,iz),{x,z,ix,iz});}ready=true;if(!cells.size)throw new Error('仙俠谷地導航網格為空。');}
function nearest(p:Vec2,maxRadius=5){const ix=Math.round((p.x-MIN)/STEP),iz=Math.round((p.z-MIN)/STEP);let best:Cell|undefined,bestD=Infinity;for(let r=0;r<=maxRadius;r++){for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;const c=cells.get(key(ix+dx,iz+dz));if(!c)continue;const d=(c.x-p.x)**2+(c.z-p.z)**2;if(d<bestD){best=c;bestD=d;}}if(best)return best;}return best;}
class Heap<T>{private a:{p:number;v:T}[]=[];get size(){return this.a.length;}push(v:T,p:number){const a=this.a,n={p,v};a.push(n);let i=a.length-1;while(i){const q=(i-1)>>1;if(a[q].p<=p)break;a[i]=a[q];i=q;}a[i]=n;}pop(){const a=this.a;if(!a.length)return;const out=a[0].v,last=a.pop()!;if(a.length){let i=0;while(true){let l=i*2+1,r=l+1;if(l>=a.length)break;let c=r<a.length&&a[r].p<a[l].p?r:l;if(a[c].p>=last.p)break;a[i]=a[c];i=c;}a[i]=last;}return out;}}
const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
function route(from:Cell,to:Cell){const open=new Heap<Cell>(),g=new Map<string,number>(),came=new Map<string,string>(),start=key(from.ix,from.iz),goal=key(to.ix,to.iz);g.set(start,0);open.push(from,0);const heuristic=(c:Cell)=>Math.hypot(c.x-to.x,c.z-to.z);let guard=0;while(open.size&&guard++<cells.size*6){const cur=open.pop()!,ck=key(cur.ix,cur.iz);if(ck===goal){const out:Cell[]=[cur];let k=ck;while(k!==start){k=came.get(k)!;const c=cells.get(k);if(!c)break;out.push(c);}return out.reverse();}const base=g.get(ck)!;for(const [dx,dz] of dirs){const next=cells.get(key(cur.ix+dx,cur.iz+dz));if(!next)continue;if(dx&&dz){if(!cells.has(key(cur.ix+dx,cur.iz))||!cells.has(key(cur.ix,cur.iz+dz)))continue;}if(!groundStepAllowed(cur,next))continue;const nk=key(next.ix,next.iz),ng=base+Math.hypot(next.x-cur.x,next.z-cur.z);if(ng>=(g.get(nk)??Infinity))continue;came.set(nk,ck);g.set(nk,ng);open.push(next,ng+heuristic(next));}}return undefined;}
function simplify(path:Vec2[]){if(path.length<3)return path;const out=[path[0]];let anchor=path[0];for(let i=2;i<path.length;i++){if(!groundStepAllowed(anchor,path[i])){out.push(path[i-1]);anchor=path[i-1];}}out.push(path[path.length-1]);return out;}

/** Renderer-independent authoritative A* navigation. No rendering-engine dependency is allowed in the server domain. */
export class NavigationDomain{
 constructor(){ensureGrid();}
 path(from:Vec2,to:Vec2):Vec2[]{if(!walkable(to,1))throw new Error('此處被地形或林木阻擋，請選擇附近可通行位置。');const a=nearest(from,4),b=nearest(to,4);if(!a||!b)throw new Error('找不到可通行的路線。');const found=route(a,b);if(!found?.length)throw new Error('找不到可通行的路線。');let result=simplify(found.map(c=>({x:c.x,z:c.z})));if(groundStepAllowed(from,result[0]))result[0]={...from};if(groundStepAllowed(result[result.length-1],to))result.push({...to});if(distance(result.at(-1)!,to)>4.5)throw new Error('找不到可通行的路線。');return result;}
 step(from:Vec2,to:Vec2):Vec2{if(groundStepAllowed(from,to))return to;const xOnly={x:to.x,z:from.z};if(groundStepAllowed(from,xOnly))return xOnly;const zOnly={x:from.x,z:to.z};if(groundStepAllowed(from,zOnly))return zOnly;return {...from};}
}
