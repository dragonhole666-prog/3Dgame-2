import {
  Color3,
  Effect,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShaderMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';

const VERT=`precision highp float;attribute vec3 position;uniform mat4 world;uniform mat4 worldViewProjection;varying vec3 vWorld;void main(){vec4 w=world*vec4(position,1.0);vWorld=w.xyz;gl_Position=worldViewProjection*vec4(position,1.0);}`;
const FRAG=`precision highp float;varying vec3 vWorld;uniform float uTime;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+17.1;a*=.5;}return v;}void main(){vec2 p=vWorld.xz*.009+vec2(uTime*.0045,-uTime*.003);float d=length(vWorld.xz);float outer=smoothstep(66.,116.,d)*(1.-smoothstep(330.,455.,d));float n=fbm(p)+.38*fbm(p*2.2+4.);float a=outer*smoothstep(.45,1.04,n)*.28;float edge=smoothstep(.38,.86,n);vec3 c=mix(vec3(.58,.70,.74),vec3(.93,.91,.84),edge*.78);c+=vec3(.14,.07,.02)*smoothstep(.72,1.12,n)*.08;gl_FragColor=vec4(c,a);}`;
Effect.ShadersStore['qinglanCloudVertexShader']=VERT;Effect.ShadersStore['qinglanCloudFragmentShader']=FRAG;

export class XianxiaHorizon{
  readonly root:TransformNode;private cloud:Mesh;private cloudMat:ShaderMaterial;private lights:Mesh[]=[];private detail:'low'|'balanced'|'high';
  constructor(private scene:Scene,detail:'low'|'balanced'|'high'='balanced'){
    this.detail=detail;this.root=new TransformNode('QL-DistantSectCloudSea',scene);
    this.cloud=MeshBuilder.CreateGround('QL-CloudSea',{width:780,height:780,subdivisions:1},scene);this.cloud.position.y=17.5;this.cloud.parent=this.root;this.cloudMat=new ShaderMaterial('QL-CloudShader',scene,{vertex:'qinglanCloud',fragment:'qinglanCloud'},{attributes:['position'],uniforms:['world','worldViewProjection','uTime'],needAlphaBlending:true});this.cloudMat.backFaceCulling=false;this.cloudMat.setFloat('uTime',0);this.cloud.material=this.cloudMat;
    const sites=[[-155,48,-90,1.25],[-112,58,-184,1.55],[-22,70,-215,1.75],[91,54,-183,1.35],[172,62,-85,1.55],[186,46,42,1.15],[-175,42,71,1.12]] as const;
    const bodyMat=new PBRMaterial('QL-DistantBody',scene);bodyMat.albedoColor=Color3.FromHexString('#59676A');bodyMat.roughness=.82;bodyMat.metallic=.01;const roofMat=new PBRMaterial('QL-DistantRoof',scene);roofMat.albedoColor=Color3.FromHexString('#2F3032');roofMat.roughness=.56;roofMat.metallic=.08;
    const bodySrc=MeshBuilder.CreateCylinder('QL-DistantBodySource',{diameterTop:1.44,diameterBottom:1.8,height:1,tessellation:8},scene);bodySrc.material=bodyMat;bodySrc.isVisible=false;bodySrc.parent=this.root;const roofSrc=MeshBuilder.CreateCylinder('QL-DistantRoofSource',{diameterTop:0,diameterBottom:3.3,height:.52,tessellation:4},scene);roofSrc.material=roofMat;roofSrc.isVisible=false;roofSrc.parent=this.root;
    const glowMat=new PBRMaterial('QL-DistantLamp',scene);glowMat.albedoColor=Color3.FromHexString('#8D6B43');glowMat.emissiveColor=Color3.FromHexString('#E7C486');glowMat.emissiveIntensity=1.8;glowMat.disableLighting=true;
    for(const [x,y,z,s] of sites)for(let t=0;t<3;t++){const yy=y+t*2.15*s,body=bodySrc.createInstance(`sect-body-${x}-${t}`);body.position.set(x,yy,z);body.scaling.set(s*(1-t*.09),2.2*s,s*(1-t*.09));body.rotation.y=Math.PI*.25;body.parent=this.root;const roof=roofSrc.createInstance(`sect-roof-${x}-${t}`);roof.position.set(x,yy+1.28*s,z);roof.scaling.setAll(s*(1.1-t*.08));roof.rotation.y=Math.PI*.25;roof.parent=this.root;const lamp=MeshBuilder.CreateSphere(`sect-lamp-${x}-${t}`,{diameter:.32*s,segments:6},scene);lamp.position.set(x+(t%2?-.45:.45)*s,yy+.65*s,z+.78*s);lamp.material=glowMat;lamp.parent=this.root;this.lights.push(lamp);}
    this.setDetail(detail);
  }
  setDetail(detail:'low'|'balanced'|'high'){this.detail=detail;this.root.setEnabled(detail!=='low');for(const l of this.lights)l.setEnabled(detail==='high');}
  update(time:number){if(!this.root.isEnabled())return;this.cloudMat.setFloat('uTime',time);this.cloud.position.y=17.5+Math.sin(time*.08)*.18;for(const l of this.lights)if(l.isEnabled()){const m=l.material as PBRMaterial;m.emissiveIntensity=1.6+Math.sin(time*1.7)*.3;}}
  dispose(){this.root.dispose(false,true);this.cloudMat.dispose();}
}
