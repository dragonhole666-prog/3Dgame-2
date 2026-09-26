# P0.27.0 Babylon.js Migration

## Runtime boundary

The active browser renderer is Babylon.js. Three.js source is quarantined under `src/legacy-three/` and must not be imported by active client/editor/server-navigation code.

## Rendering target

The supplied reference frame is treated as a rendering/look-development target, not as scene geometry to copy. The P0.27 stack uses:

- semantic PBR material remapping
- warm directional key + cool hemispheric fill
- cascaded outdoor shadows
- SSAO2
- ACES tone mapping
- restrained bloom / FXAA
- localized atmospheric mist
- reflection probe / water separation
- a reference-matched post grade with teal/blue-grey shadows and warm maple/peach highlights

Measured reference targets used by the grade are approximately: mean luminance 0.398, median 0.334, shadow occupancy 21.3%, highlight occupancy 11.0%.

## Git / LFS import

The complete source package is much larger than a normal GitHub API transaction because GLB, VRM and texture assets account for most of the repository size. Import the full P0.27 package on this branch with Git LFS:

```bash
git lfs install
git lfs track "*.glb" "*.vrm" "*.fbx" "*.hdr" "*.exr" "*.png" "*.jpg" "*.jpeg"
git add .
git commit -m "feat: migrate runtime to Babylon.js P0.27.0"
git push -u origin feat/babylon-p0270
```

After the first networked `npm install`, commit the generated `package-lock.json`. CI should then use `npm ci`.

## Release gate

```text
npm run verify:babylon
npm run typecheck
npm run test
npm run build
```

Do not merge this branch until the complete source/LFS import is present and all four checks pass.
