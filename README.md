# 青嵐志 · 3Dgame-2

## P0.27.1 — Babylon.js Only

此分支採 **單一 3D 引擎架構**：瀏覽器端 3D runtime、角色、怪物、世界、編輯器與 LookDev 全部統一使用 Babylon.js。

舊的 Three.js runtime 不再保留、不再隔離、不再做相容層，也不允許重新混入專案。

### Engine stack

- @babylonjs/core 9.28.0
- @babylonjs/loaders 9.28.0
- @babylonjs/materials 9.28.0
- Babylon Scene / Engine / AnimationGroup / Skeleton / MorphTarget / PBR / GLB loader
- renderer-independent authoritative server navigation

### Removed

- src/legacy-three/
- Three.js / three-pathfinding / @pixiv/three-vrm / @types/three dependencies
- old Three.js regression tests
- old renderer verification scripts and compatibility exclusions

### Commercial LookDev / Rendering

參考提供的仙俠範例圖，渲染採 Babylon-native pipeline：

- semantic PBR material classification
- warm key + cool fill
- cascaded shadows
- SSAO
- reflection probes
- ACES tone mapping
- restrained bloom
- localized atmosphere / mist
- reference-matched teal/blue-grey shadows + warm maple/peach highlights

### Release gate

PR 合併前必須通過：

```bash
npm run verify:babylon
npm run verify:current
npm run verify:package
npm run verify:fit-garments
npm run typecheck
npm run test
npm run build
```

`verify:babylon` 會直接阻擋舊 renderer source directory、舊 renderer imports 與舊 renderer dependencies。

### Git / LFS

GLB / VRM / FBX / HDR / EXR / PNG / JPG 等大型資產使用 Git LFS。完整 source 與 LFS objects 全部進入此 branch 後，CI 全綠才合併至 `main`。
