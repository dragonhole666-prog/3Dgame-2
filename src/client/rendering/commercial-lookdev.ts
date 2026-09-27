import {
  Camera,
  CascadedShadowGenerator,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  HemisphericLight,
  Mesh,
  ReflectionProbe,
  Scene,
  ShadowGenerator,
  SSAO2RenderingPipeline,
  Vector3,
} from '@babylonjs/core';
import type { GraphicsSettings,PostProcessingQuality,ShadowQuality } from '../core/graphics-settings';
import { CinematicGradeController,configureSceneImageProcessing } from './cinematic-rendering-pipeline';

/**
 * Babylon.js commercial LookDev stack.
 *
 * Reference intent:
 * - deep but colored shadows (blue-grey / teal, never crushed neutral black)
 * - warm maple/peach highlights
 * - water/specular separation without plastic gloss
 * - localized atmosphere + restrained bloom
 * - ACES shoulder with preserved ivory highlights
 */
export class CommercialLookDev {
  readonly sun:DirectionalLight;
  readonly skyFill:HemisphericLight;
  readonly pipeline:DefaultRenderingPipeline;
  readonly grade:CinematicGradeController;
  readonly shadows:CascadedShadowGenerator;
  private ssao?:SSAO2RenderingPipeline;
  private reflectionProbe?:ReflectionProbe;
  private post:PostProcessingQuality='off';
  constructor(private scene:Scene,private camera:Camera,graphics:GraphicsSettings){
    scene.clearColor=Color4.FromHexString('#BFD9E6FF');
    scene.ambientColor=Color3.FromHexString('#263A42');
    scene.fogMode=Scene.FOGMODE_EXP2;scene.fogColor=Color3.FromHexString('#91ADBA');scene.fogDensity=.0022;

    this.skyFill=new HemisphericLight('QL-SkyFill',new Vector3(.15,1,.12),scene);
    this.skyFill.diffuse=Color3.FromHexString('#BFDCE7');this.skyFill.groundColor=Color3.FromHexString('#38545A');this.skyFill.specular=Color3.FromHexString('#DCE8E8');this.skyFill.intensity=.64;

    this.sun=new DirectionalLight('QL-WarmKey',new Vector3(-.48,-.82,.30),scene);
    this.sun.diffuse=Color3.FromHexString('#F4C9AC');this.sun.specular=Color3.FromHexString('#FFF1DD');this.sun.intensity=2.35;this.sun.position.set(70,110,-55);

    this.shadows=new CascadedShadowGenerator(this.shadowMapSize(graphics.shadowQuality),this.sun);
    this.shadows.bias=.00025;this.shadows.normalBias=.014;this.shadows.lambda=.76;this.shadows.cascadeBlendPercentage=.12;this.shadows.shadowMaxZ=135;this.shadows.autoCalcDepthBounds=true;
    this.shadows.usePercentageCloserFiltering=true;this.shadows.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;

    this.pipeline=new DefaultRenderingPipeline('QL-CommercialPipeline',true,scene,[camera],true);
    this.pipeline.fxaaEnabled=true;this.pipeline.bloomEnabled=true;this.pipeline.bloomKernel=56;this.pipeline.bloomScale=.5;this.pipeline.bloomThreshold=.79;this.pipeline.bloomWeight=.18;
    this.pipeline.sharpenEnabled=false;this.pipeline.grainEnabled=false;this.pipeline.chromaticAberrationEnabled=false;
    this.pipeline.depthOfFieldEnabled=false;this.pipeline.samples=1;

    this.grade=new CinematicGradeController(scene,camera);
    this.apply(graphics);
  }
  private shadowMapSize(q:ShadowQuality){return q==='high'?2048:q==='medium'?1536:1024;}
  apply(graphics:GraphicsSettings){
    this.sun.setEnabled(graphics.shadows);const shadowMap=this.shadows.getShadowMap();if(shadowMap){shadowMap.refreshRate=0;if(graphics.shadows)shadowMap.resetRefreshCounter();}
    const post=graphics.postProcessing;this.post=post;configureSceneImageProcessing(this.scene,post);
    this.pipeline.fxaaEnabled=post!=='off';this.pipeline.bloomEnabled=post!=='off';
    this.pipeline.bloomThreshold=post==='cinematic'?.76:.82;this.pipeline.bloomWeight=post==='cinematic'?.20:post==='light'?.12:0;this.pipeline.bloomKernel=post==='cinematic'?64:36;
    this.pipeline.samples=graphics.shadowQuality==='high'&&post==='cinematic'?2:1;
    this.setSsao(post);
    const engine=this.scene.getEngine();this.grade.configure(post,engine.getRenderWidth(),engine.getRenderHeight());
    // Avoid glossy toy-plastic appearance: lighting changes are subtle between tiers.
    this.sun.intensity=post==='cinematic'?2.45:post==='light'?2.28:2.12;this.skyFill.intensity=post==='cinematic'?.62:.67;
    this.scene.fogDensity=graphics.viewDistance==='far'?.00185:graphics.viewDistance==='near'?.0029:.0022;
  }
  private setSsao(level:PostProcessingQuality){
    const mgr=this.scene.postProcessRenderPipelineManager;
    if(level==='off'){
      if(this.ssao){try{mgr.detachCamerasFromRenderPipeline('QL-SSAO',[this.camera]);}catch{}this.ssao.dispose();this.ssao=undefined;}return;
    }
    if(!this.ssao){
      this.ssao=new SSAO2RenderingPipeline('QL-SSAO',this.scene,{ssaoRatio:level==='cinematic'?.65:.5,blurRatio:.5},[this.camera]);
      this.ssao.radius=1.5;this.ssao.totalStrength=level==='cinematic'?.72:.48;this.ssao.base=.08;this.ssao.expensiveBlur=level==='cinematic';this.ssao.samples=level==='cinematic'?16:8;this.ssao.maxZ=120;this.ssao.minZAspect=.22;
    }else{
      this.ssao.totalStrength=level==='cinematic'?.72:.48;this.ssao.samples=level==='cinematic'?16:8;this.ssao.expensiveBlur=level==='cinematic';
    }
  }
  registerShadowCaster(mesh:Mesh){this.shadows.addShadowCaster(mesh,true);mesh.receiveShadows=true;const shadowMap=this.shadows.getShadowMap();if(shadowMap){shadowMap.refreshRate=0;shadowMap.resetRefreshCounter();}}
  createStaticReflectionProbe(meshes:Mesh[]){
    this.reflectionProbe?.dispose();const size=this.post==='cinematic'?256:128;const probe=new ReflectionProbe('QL-StaticEnvironmentProbe',size,this.scene,true,true);
    probe.position.set(0,5,-8);for(const mesh of meshes)if(mesh.isVisible&&mesh.isEnabled())probe.renderList?.push(mesh);probe.refreshRate=0;this.scene.environmentTexture=probe.cubeTexture;this.reflectionProbe=probe;
    return probe;
  }
  update(time:number){this.grade.update(time);}
  resize(){const e=this.scene.getEngine();this.grade.resize(e.getRenderWidth(),e.getRenderHeight());}
  dispose(){this.reflectionProbe?.dispose();this.ssao?.dispose();this.grade.dispose();this.pipeline.dispose();this.shadows.dispose();this.sun.dispose();this.skyFill.dispose();}
}
