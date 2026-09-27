import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {REFERENCE_LOOK_TARGET} from '../src/client/rendering/cinematic-rendering-pipeline';

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),'utf8');
describe('Babylon commercial LookDev',()=>{
  it('keeps the reference-calibrated density targets',()=>{
    expect(REFERENCE_LOOK_TARGET.meanLuminance).toBeCloseTo(.398,3);
    expect(REFERENCE_LOOK_TARGET.medianLuminance).toBeCloseTo(.334,3);
    expect(REFERENCE_LOOK_TARGET.shadowOccupancy).toBeCloseTo(.213,3);
  });
  it('uses cascaded shadows, SSAO, restrained bloom and ACES image processing',()=>{
    const look=read('src/client/rendering/commercial-lookdev.ts');
    const grade=read('src/client/rendering/cinematic-rendering-pipeline.ts');
    expect(look).toContain('CascadedShadowGenerator');
    expect(look).toContain('SSAO2RenderingPipeline');
    expect(look).toContain('bloomThreshold');
    expect(grade).toContain('TONEMAPPING_ACES');
    expect(grade).toContain('qinglanReferenceGradeFragmentShader');
  });
});
