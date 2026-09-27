import { defineConfig } from 'vitest/config';

export default defineConfig({
  test:{
    environment:'node',
    include:[
      'src/**/*.test.ts',
      'tests/babylon-*.test.ts',
      'tests/character-login-hf17.test.ts',
      'tests/character-panel-r6.test.ts',
      'tests/client-attack-prediction.test.ts',
      'tests/combat-readability-hf13.test.ts',
      'tests/combat-targeting.test.ts',
      'tests/command-schema.test.ts',
      'tests/domains.test.ts',
      'tests/editor-equipment-import-hf9.test.ts',
      'tests/equipment-two-hand-p0266.test.ts',
      'tests/graphics-capability.test.ts',
      'tests/graphics-safety.test.ts',
      'tests/knockback.test.ts',
      'tests/locomotion-gait-p0266.test.ts',
      'tests/network-interest.test.ts',
      'tests/network-policy.test.ts',
      'tests/panel-registry.test.ts',
      'tests/rendered-locomotion-p0267.test.ts',
      'tests/runtime-quality-guard.test.ts',
      'tests/weapon-handedness-hf16.test.ts',
      'tests/weapon-skills.test.ts',
      'tests/world-bootstrap.test.ts'
    ]
  }
});
