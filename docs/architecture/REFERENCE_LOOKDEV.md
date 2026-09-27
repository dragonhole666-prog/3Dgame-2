# Reference-Matched Commercial LookDev

Reference: `docs/reference/lookdev-reference.jpg` (user-supplied visual target).

The target is **rendering/color finish**, not scene-copying. Measured from the left 85% of the reference frame to avoid the title UI:
- mean luminance: ~0.398
- median luminance: ~0.334
- shadow occupancy (<0.20): ~21.3%
- highlight occupancy (>0.80): ~11.0%

## Visual grammar
- Shadows: deep blue-grey / teal, colored rather than neutral black.
- Highlights: warm peach/maple/ivory, ACES shoulder preserved.
- Foliage: maple/coral families with jade counter-balance; avoid primary-red/orange saturation.
- Water: blue-teal with low roughness, reflection separation, no cyan plastic.
- Stone/wood: high roughness with modest environment contribution.
- Metals: metallic response is allowed; non-metal surfaces must not use metalness as a fake contrast control.
- Atmosphere: localized mist + distant aerial perspective. Do not wash the whole frame with white fog.

## Babylon stack
`CommercialLookDev` owns lighting, cascaded shadows, SSAO2, bloom, FXAA, reflection capture and the final reference grade. `xianxia-visual-style.ts` owns semantic material families and vertex-color reinterpretation of the uploaded terrain/forest GLB.

The grade targets density/hue separation and contains only a small sharpen, vignette, grain and warm halation component. It is deliberately not a heavy cinematic LUT because the reference's quality is driven primarily by surface response, lighting hierarchy and atmosphere.
