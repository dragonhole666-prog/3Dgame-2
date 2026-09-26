# 青嵐志 · 3Dgame-2

Babylon.js migration workspace.

P0.27.0 的目標是把瀏覽器 3D runtime 從 Three.js 遷移到 Babylon.js，並建立商業級仙俠 LookDev / Rendering：PBR、Cascaded Shadows、SSAO、ACES tone mapping、節制 Bloom、局部霧，以及依提供的參考圖校準的色彩分離與 density curve。

目前完整 P0.27.0 source package 含大量 GLB / VRM / texture binary，應透過 Git LFS 匯入。GitHub API 工作區先建立 main 與 migration branch，完整 source / LFS 應推入 `feat/babylon-p0270` 後再合併。

## Branch policy

- `main`：只接受可發佈版本
- `feat/**`：引擎、玩法、LookDev 功能
- `fix/**`：聚焦回歸修正
- merge 前要求 Babylon runtime boundary、typecheck、tests、production build 全部通過
