# 青嵐志 · P0.27.1 Babylon.js Only

此版本將瀏覽器 3D runtime 完整統一為 **Babylon.js**。舊 renderer source tree 已實體刪除，不保留平行 scene graph、不提供舊引擎 fallback，也不允許在 client、editor 或 authoritative navigation 重新引入第二套 3D runtime。

## Runtime architecture

- `src/client/core/game.ts` — Babylon `Engine` / `Scene` / camera / frame loop
- `src/client/world/world-renderer.ts` — Babylon GLB world loading
- `src/client/character/character.ts` — Babylon character facade
- `src/client/character/babylon-character-animation-runtime.ts` — `AnimationGroup` animation coordinator
- `src/client/character/babylon-equipment-runtime.ts` — GLB equipment, sockets and skeleton mapping
- `src/client/character/babylon-expression-runtime.ts` — Babylon morph-target expressions
- `src/client/character/monster-model.ts` — Babylon monster/Boss loading and skeleton-first scale calibration
- `src/client/rendering/commercial-lookdev.ts` — commercial lighting/shadow/SSAO/reflection pipeline
- `src/client/rendering/cinematic-rendering-pipeline.ts` — ACES + reference-matched color grade
- `src/client/rendering/xianxia-visual-style.ts` — semantic PBR material standardization
- `src/shared/domains/navigation.ts` — renderer-independent bounded A*

## LookDev target

提供的仙俠參考圖只作為 **著色、光影、材質與最終成色** 的 LookDev 目標，不複製其場景配置。渲染管線採暖色方向光、冷色環境補光、Cascaded Shadows、SSAO2、Reflection Probe、ACES tone mapping、節制 Bloom、局部霧與 reference grade，避免高飽和塑膠感與廉價卡通質感。

參考圖校準值：mean luminance `0.398`、median `0.334`、shadow occupancy `0.213`、highlight occupancy `0.110`。

## Git workflow

- `main`：可發佈版本
- `feat/**`：功能、引擎、LookDev
- `fix/**`：回歸修正
- GLB / VRM / FBX / HDR / EXR / PNG / JPG 使用 Git LFS
- PR 合併前：`npm run verify:babylon` → `npm run verify:current` → `npm run typecheck` → `npm run test` → `npm run build`

首次安裝依賴後需提交 `package-lock.json`；之後 CI 可由 `npm install` 切換為 `npm ci`。
