# P0.27.1 Migration Status

- Babylon.js is the sole browser 3D runtime.
- Former renderer source directory: **deleted**.
- Former renderer npm dependencies: **removed**.
- Character avatar loading: Babylon SceneLoader.
- Character locomotion/combat animation: Babylon AnimationGroup coordinator.
- Equipment: Babylon GLB loader + semantic sockets + Babylon skeleton local-matrix mirroring.
- Expressions: Babylon MorphTarget runtime.
- Monsters/Bosses: Babylon GLB loader + skeleton-first visual-height calibration.
- World: Babylon GLB renderer.
- LookDev: Cascaded Shadows + SSAO2 + reflection + ACES + restrained bloom + reference grade.
- Server navigation: renderer-independent bounded A*.
- GitHub gate: static Babylon-only guard + typecheck + tests + production build.

There is no compatibility-mode branch in the runtime graph.
