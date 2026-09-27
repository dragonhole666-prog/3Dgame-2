HF8 automatic equipment-module folder
====================================

Add a new body-worn GLB here with the gameplay item id as the filename:

  <item-id>.glb

Example:
  primordial-god-armor.glb

Then run the normal dev/build/check workflow. The HF8 preflight script scans this folder and regenerates
src/shared/data/equipment-fit-modules.generated.ts automatically.

Runtime policy:
1. Skinned GLB -> bind-pose transfer -> avatar Skeleton -> missing standard Morph completion -> clearance corrective Morph.
2. Rigid GLB body wearable -> automatic slot-aware skin weights -> standard Morph completion -> clearance corrective Morph.
3. Body-worn item with no module -> existing authored/template/generated HF7 fallback, still under HF8 fit QA.
4. Weapons, crowns, rings and other true rigid accessories do not use garment auto-fit.
