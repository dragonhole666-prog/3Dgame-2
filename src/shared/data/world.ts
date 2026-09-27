import type { Vec2 } from '../types';
import { XIANXIA_MAP, xianxiaHeightAt, xianxiaMapWalkable } from './xianxia-world-map';

/** P0.25.4: world bounds now follow the user-supplied 512x512 GLB. */
export const WORLD = {
 name:'青嵐荒域',
 subtitle:'荒古異變錄',
 half:252,
 chunk:32,
 spawn:{x:-34,z:48},
 seed:98137,
 mapAsset:XIANXIA_MAP.asset,
};

export const REGIONS = [
 {id:'town',name:'青嵐荒門',level:'安全宗門',x:-34,z:48,radius:22,color:'#bba67b',description:'荒域邊緣最後的安全宗門。山門之外是古獸、毒瘴與破碎神墟交疊的無主之地。'},
 {id:'bamboo',name:'蒼梧毒林',level:'建議 Lv. 1–6',x:-14,z:13,radius:25,color:'#698f72',description:'古木與竹海被殘留氯化異質污染，低階野獸出現發光斑紋與甲化病灶。'},
 {id:'marsh',name:'氯瘴腐澤',level:'建議 Lv. 4–10',x:-52,z:-9,radius:23,color:'#7e9270',description:'綠霧貼地，腐水中常見環蛇、浮游魚獸與失控異核。'},
 {id:'lake',name:'玄陰寒潭',level:'建議 Lv. 7–14',x:23,z:40,radius:23,color:'#6e9ca7',description:'寒潭下埋著荒古石甲，受污染的水族與玄甲獸在月夜浮出水面。'},
 {id:'fox',name:'霜骨天原',level:'地圖王 · 建議 Lv. 14+',x:-54,z:-48,radius:25,color:'#b9c2d0',description:'冰霧覆骨。霜尾天狐盤踞於古祭台，是西境地圖王之一。'},
 {id:'zheng',name:'赤碑獸塚',level:'建議 Lv. 12–22',x:31,z:-25,radius:25,color:'#a68a73',description:'殘碑刻滿失落獸紋，五尾猙與重甲異獸在此爭奪古器碎片。'},
 {id:'bird',name:'天裂神崖',level:'地圖王 · 建議 Lv. 18+',x:69,z:4,radius:21,color:'#aa91a4',description:'高崖被罡風切出裂谷，蠱雕王巡弋上空，翼下散落神兵殘屑。'},
 {id:'boss',name:'雷澤神墟',level:'地圖王 · 建議 Lv. 22+',x:35,z:-76,radius:25,color:'#9b85c3',description:'被雷火熔成黑玻璃的古神墟。雷澤夔尊守著最高階神裝與荒古兵器。'},
 {id:'queen',name:'金曜王庭',level:'地圖王 · 建議 Lv. 20+',x:8,z:140,radius:22,color:'#d7bd78',description:'北境高地殘留的王庭演武場。金髮女王持劍巡守，擅長高速近戰與日冕爆發。'}
];

export const NPCS = [
 {id:'guide',name:'沈聽風',role:'荒域行山客 · 異獸情報',x:-29,z:46,angle:2.9,intel:['wolf','snake','turtle','mutant-boar','bog-angler','chlorine-bat','fox','zheng','gudiao','golden-queen','kui'],dialog:'林澤裡的異變獸會掉成套護具，越深入污染痕跡越重。霜骨、天裂、金曜王庭、雷澤各有地圖王；看到天地異象先觀察前搖，再進場。'},
 {id:'smith',name:'陸千錘',role:'荒古鑄器師 · 修理裝備',x:-45,z:46,angle:1.5,intel:['zheng','gudiao','golden-queen','kui'],dialog:'異變獸材能煉套裝，神獸核心才能承受神兵器紋。歸來先整一整衣甲，再走下一程。修復全身裝備需要 20 靈石。'},
 {id:'broker',name:'蘇望月',role:'荒域行商 · 玩家市集',x:-21,z:46,angle:3,intel:['fox','golden-queen','kui'],dialog:'小怪掉套裝，地圖王掉神裝與神兵，但詞綴、品相仍各不相同。真正值錢的是能組成流派的那一件。'}
];

/**
 * Legacy procedural obstacles are intentionally empty in P0.25.4.
 * Keeping them after replacing the visual map would create invisible ghost walls.
 */
export const OBSTACLES: Array<{x:number;z:number;r:number;type:'rock'|'house'|'pavilion'|'lantern'|'lake'}> = [];

/** Shared authoritative surface height extracted from xianxia_world.glb. */
export function heightAt(x:number,z:number){return xianxiaHeightAt(x,z);}

/** Server-authoritative footprint test extracted from the same GLB forest geometry. */
export function walkable(p:Vec2,margin=.55){return xianxiaMapWalkable(p,margin);}

/**
 * Reject cliff/steep-slope traversal while allowing ordinary terrain undulation.
 * Object collision is checked by walkable(); vertical traversal is checked here.
 */
export function groundStepAllowed(from:Vec2,to:Vec2){
 if(!walkable(to))return false;
 const planar=Math.max(.001,Math.hypot(to.x-from.x,to.z-from.z));
 return Math.abs(heightAt(to.x,to.z)-heightAt(from.x,from.z))<=.86+planar*.34;
}

export function regionAt(p:Vec2){return [...REGIONS].sort((a,b)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(p.x-b.x,p.z-b.z))[0];}
