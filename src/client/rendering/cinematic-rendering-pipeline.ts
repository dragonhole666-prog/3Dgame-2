import {
  Camera,
  Effect,
  Engine,
  ImageProcessingConfiguration,
  PostProcess,
  Scene,
  Texture,
} from '@babylonjs/core';
import type { PostProcessingQuality } from '../core/graphics-settings';

export type CinematicGradeLevel=PostProcessingQuality;

/** Measured from the supplied 1200×675 reference frame (left 85%, UI title excluded). */
export const REFERENCE_LOOK_TARGET={
  medianLuminance:.334,
  meanLuminance:.398,
  shadowOccupancy:.213,
  highlightOccupancy:.110,
  family:'deep teal / blue-grey shadows + warm maple / peach highlights',
} as const;

const FRAGMENT=`
#ifdef GL_ES
precision highp float;
#endif
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 uTexel;
uniform float uStrength;
uniform float uSharpen;
uniform float uGrain;
uniform float uVignette;
uniform float uTime;
uniform float uDensity;
uniform float uChroma;
uniform float uCoral;
uniform float uTeal;

float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
vec3 saturateColor(vec3 c,float s){float y=luma(c);return mix(vec3(y),c,s);}
float refCurve(float y){y=max(y,0.0);float dense=max(pow(clamp(y,0.0,1.0),2.15),y*.34);dense=mix(dense,smoothstep(.025,.89,dense),.22);dense+=smoothstep(.70,1.0,y)*.115;return clamp(dense,0.0,1.04);}
vec3 applyReferenceDensity(vec3 c,float amount){vec3 n=c/(vec3(1.0)+c*.32);float y=max(luma(n),1e-5);float target=refCurve(y);vec3 graded=n*(target/y);return mix(n,graded,amount);}
vec3 hueSeparation(vec3 c,float amount){
  float y=luma(c);float mx=max(c.r,max(c.g,c.b));float mn=min(c.r,min(c.g,c.b));float sat=max(mx-mn,0.0);
  float warmMask=smoothstep(.015,.24,c.r-c.b)*smoothstep(.02,.18,c.r-c.g)*smoothstep(.07,.60,y);
  c*=mix(vec3(1.0),vec3(1.10,1.015,.90),warmMask*.34*uCoral*amount);c+=vec3(.040,.008,-.018)*warmMask*uCoral*amount;
  float cyanMask=smoothstep(.015,.22,c.b-c.r)*smoothstep(-.03,.18,c.g-c.r)*smoothstep(.04,.68,y);
  c*=mix(vec3(1.0),vec3(.88,1.03,1.12),cyanMask*.42*uTeal*amount);c+=vec3(-.014,.018,.044)*cyanMask*uTeal*amount;
  float greenMask=smoothstep(.02,.20,c.g-c.r)*smoothstep(.0,.18,c.g-c.b)*(1.0-cyanMask*.75);c+=vec3(.018,-.004,-.018)*greenMask*.32*amount;
  return saturateColor(c,1.0+uChroma*(.26+.52*(1.0-smoothstep(.18,.62,sat)))*amount);
}
void main(){
  vec3 center=texture2D(textureSampler,vUV).rgb;
  vec3 n=texture2D(textureSampler,vUV+vec2(0.0,uTexel.y)).rgb;
  vec3 s=texture2D(textureSampler,vUV-vec2(0.0,uTexel.y)).rgb;
  vec3 e=texture2D(textureSampler,vUV+vec2(uTexel.x,0.0)).rgb;
  vec3 w=texture2D(textureSampler,vUV-vec2(uTexel.x,0.0)).rgb;
  vec3 ne=texture2D(textureSampler,vUV+uTexel).rgb;
  vec3 sw=texture2D(textureSampler,vUV-uTexel).rgb;
  vec3 blur=(n+s+e+w+ne+sw)*.1666667;
  vec3 c=max(vec3(0.0),center+(center-blur)*uSharpen);
  c=applyReferenceDensity(c,uDensity*uStrength);
  float y=luma(c);float shadowMask=1.0-smoothstep(.12,.47,y);float highMask=smoothstep(.52,.91,y);float midMask=max(0.0,1.0-shadowMask*.78-highMask*.62);
  c*=mix(vec3(1.0),vec3(.79,.97,1.10),shadowMask*.36*uStrength);
  c*=mix(vec3(1.0),vec3(1.09,1.018,.925),highMask*.30*uStrength);
  c=saturateColor(c,1.0+.13*midMask*uStrength);c=hueSeparation(c,uStrength);
  float yy=luma(c);c-=vec3(.010,.008,.006)*(1.0-smoothstep(.20,.55,yy))*uStrength;
  float blurY=luma(blur/(vec3(1.0)+blur*.32));float halo=smoothstep(.66,.98,blurY);c+=vec3(.032,.018,.009)*halo*uStrength;
  c+=vec3(.020,.014,.006)*highMask*uStrength;
  vec2 q=vUV-.5;float edge=dot(q,q);float vign=1.0-edge*uVignette;c*=mix(1.0,clamp(vign,.68,1.0),uStrength);
  float grain=(hash(vUV*vec2(2387.0,1351.0)+uTime*17.3)-.5)*uGrain;c+=grain*(.72-.42*smoothstep(.55,1.0,y));
  gl_FragColor=vec4(max(c,vec3(0.0)),1.0);
}`;

Effect.ShadersStore['qinglanReferenceGradeFragmentShader']=FRAGMENT;

export interface GradeSettings {strength:number;sharpen:number;grain:number;vignette:number;density:number;chroma:number;coral:number;teal:number;}
export const GRADE_PRESETS:Record<CinematicGradeLevel,GradeSettings>={
  off:{strength:0,sharpen:0,grain:0,vignette:0,density:0,chroma:0,coral:0,teal:0},
  light:{strength:.74,sharpen:.12,grain:.0028,vignette:.36,density:.60,chroma:.40,coral:.78,teal:.82},
  cinematic:{strength:1,sharpen:.20,grain:.0046,vignette:.58,density:.94,chroma:.66,coral:1.05,teal:1.08},
};

export class CinematicGradeController{
  readonly pass:PostProcess;
  enabled=true;
  level:CinematicGradeLevel='cinematic';
  private settings={...GRADE_PRESETS.cinematic};
  private width=1920;private height=1080;private time=0;private attached=true;
  constructor(private scene:Scene,private camera:Camera){
    this.pass=new PostProcess('QL-ReferenceMatched-Grade','qinglanReferenceGrade',['uTexel','uStrength','uSharpen','uGrain','uVignette','uTime','uDensity','uChroma','uCoral','uTeal'],null,1,camera,Texture.BILINEAR_SAMPLINGMODE,scene.getEngine(),false);
    this.pass.samples=1;
    this.pass.onApply=effect=>{const s=this.settings;effect.setFloat2('uTexel',1/Math.max(1,this.width),1/Math.max(1,this.height));effect.setFloat('uStrength',s.strength);effect.setFloat('uSharpen',s.sharpen);effect.setFloat('uGrain',s.grain);effect.setFloat('uVignette',s.vignette);effect.setFloat('uTime',this.time);effect.setFloat('uDensity',s.density);effect.setFloat('uChroma',s.chroma);effect.setFloat('uCoral',s.coral);effect.setFloat('uTeal',s.teal);};
  }
  configure(level:CinematicGradeLevel,width:number,height:number){
    this.level=level;this.enabled=level!=='off';this.width=width;this.height=height;this.settings={...GRADE_PRESETS[level]};
    if(this.enabled&&!this.attached){this.camera.attachPostProcess(this.pass);this.attached=true;}
    if(!this.enabled&&this.attached){this.camera.detachPostProcess(this.pass);this.attached=false;}
  }
  update(time:number){this.time=time;}
  resize(width:number,height:number){this.width=width;this.height=height;}
  dispose(){if(this.attached)this.camera.detachPostProcess(this.pass);this.pass.dispose(this.camera);this.attached=false;}
}

export function configureSceneImageProcessing(scene:Scene,level:CinematicGradeLevel){
  const image=scene.imageProcessingConfiguration;
  image.isEnabled=true;image.toneMappingEnabled=true;image.toneMappingType=ImageProcessingConfiguration.TONEMAPPING_ACES;
  image.exposure=level==='cinematic'?.88:level==='light'?.94:1;image.contrast=level==='cinematic'?1.11:level==='light'?1.07:1.03;
  image.vignetteEnabled=false; // custom reference grade owns the vignette.
  return image;
}

/** Babylon 9 keeps final gamma/output conversion in ImageProcessingConfiguration. */
export function applyCommercialOutputDefaults(engine:Engine){
  engine.setHardwareScalingLevel(Math.max(.5,engine.getHardwareScalingLevel()));
}
