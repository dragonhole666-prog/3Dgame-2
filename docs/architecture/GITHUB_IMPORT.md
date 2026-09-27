# Full Project Import

The source package contains large GLB/VRM/texture assets. Import them with Git LFS rather than the GitHub Contents API.

```bash
git lfs install
git lfs track "*.glb" "*.vrm" "*.fbx" "*.hdr" "*.exr" "*.png" "*.jpg" "*.jpeg"
git add .
git commit -m "feat: P0.27.1 Babylon-only runtime"
git push -u origin feat/babylon-p0270
```

Before merge, run the full release gate documented in `GITHUB_WORKFLOW.md`.
