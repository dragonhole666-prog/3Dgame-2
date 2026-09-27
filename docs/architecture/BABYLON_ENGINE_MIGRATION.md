# Babylon.js Single-Engine Architecture — P0.27.1

## Decision

Browser 3D rendering, GLB loading, character animation, equipment attachment, monster rendering, editor preview and LookDev are standardized on Babylon.js. The previous renderer implementation is not archived inside `src`; it is removed from this release tree.

## Hard boundary

1. Active TypeScript under `src` and `server` must not import a second 3D renderer.
2. `package.json` contains only Babylon packages for browser 3D rendering.
3. Character animation uses Babylon `AnimationGroup`.
4. Equipment uses Babylon `SceneLoader`, `TransformNode`, `Skeleton` and semantic bone mapping.
5. World and monster assets use Babylon glTF loaders.
6. Server navigation is renderer-independent A* and imports no rendering package.
7. A CI gate fails if the retired renderer dependency or source directory returns.

## VRM assets

VRM files remain asset files because VRM is a glTF-based character format, not a renderer. They are read through Babylon's glTF loader path. Expression support is implemented with Babylon morph targets; animation and equipment are handled by Babylon runtime modules.

## No compatibility bridge

There is deliberately no dual-renderer adapter. A feature that has not yet been ported must be implemented natively in Babylon or remain disabled until ported; it must not reactivate the previous runtime as a fallback.
