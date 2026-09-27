# GitHub Engineering Flow

`main` is release-only. Development occurs on `feat/**` or `fix/**` branches and enters `main` through pull requests.

Large binary art assets are tracked with Git LFS. Code review gates require the Babylon-only architecture verifier, current release verifier, TypeScript, Vitest and Vite production build. Engine migration changes must never bypass the single-engine boundary by adding a compatibility renderer.

Recommended local release gate:

```bash
npm install
npm run verify:babylon
npm run verify:current
npm run verify:package
npm run typecheck
npm run test
npm run build
```

After `package-lock.json` is committed, CI installation should use `npm ci`.
