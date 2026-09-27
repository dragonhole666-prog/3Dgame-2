# P0.27.1 Babylon.js-Only Migration

## Runtime boundary

The project is now single-engine. Babylon.js is the only browser 3D engine.

The former Three.js source tree is **physically removed**. It is not quarantined and there is no compatibility renderer. Active client, editor, character, monster, world, LookDev and navigation-facing code must not import or depend on the former renderer family.

The architecture gate rejects:

- the former renderer source directory
- former renderer imports
- former renderer VRM/pathfinding packages
- former renderer type packages

## Babylon-native replacements

- Engine / Scene / cameras
- glTF / GLB / VRM-container loading through Babylon loaders
- AnimationGroup character locomotion/combat state runtime
- Babylon Skeleton equipment binding
- Babylon MorphTarget expression runtime
- Babylon monster/Boss renderer with skeleton-first scale calibration
- Babylon world renderer and editor viewport
- renderer-independent bounded A* server navigation

## Rendering target

The supplied reference frame is a LookDev target, not scene geometry to copy. The Babylon stack uses semantic PBR material remapping, warm directional key + cool hemispheric fill, cascaded shadows, SSAO, reflection probes, ACES tone mapping, restrained bloom, localized atmospheric mist, and a reference-matched grade.

Measured reference targets used by the grade are approximately: mean luminance 0.398, median 0.334, shadow occupancy 21.3%, highlight occupancy 11.0%.

## Git / LFS import

Large 3D assets must use Git LFS:

```bash
git lfs install
git lfs track "*.glb" "*.vrm" "*.fbx" "*.hdr" "*.exr" "*.png" "*.jpg" "*.jpeg"
git add .
git commit -m "feat: complete Babylon.js-only P0.27.1 migration"
git push -u origin feat/babylon-p0270
```

After the first networked `npm install`, commit `package-lock.json`; CI can then use `npm ci`.

## Release gate

```text
npm run verify:babylon
npm run verify:current
npm run verify:package
npm run verify:fit-garments
npm run typecheck
npm run test
npm run build
```

Do not merge until the complete source plus LFS objects are present and the gate is green.
