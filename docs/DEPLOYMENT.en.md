[简体中文](DEPLOYMENT.md) | **English**

# GitHub Pages deployment

Site: <https://drivinggodj.github.io/fanjian-notes/>. Repository: <https://github.com/DrivingGodJ/fanjian-notes>.

A push to `main` or a manual run of `Test and deploy GitHub Pages` installs locked dependencies, checks types and algorithms, downloads official model assets, builds for `/fanjian-notes/`, and runs real OCR / offline interaction tests at that project path. Only a successful build is uploaded from `dist/` and deployed to the `github-pages` environment. The Pages publishing source is GitHub Actions.

Models, SDK runtime and WASM resources are prepared in CI and deployed with the application, rather than committed as large source files. The browser requests same-origin static resources; user photos and OCR text never enter Actions or a server.

## Reproduce the project-path build locally

```powershell
pnpm install
$env:VITE_BASE_PATH='/fanjian-notes/'
pnpm run assets:ocr
pnpm run typecheck
pnpm test
pnpm build
pnpm run test:e2e
```

Keep the environment variable when running `pnpm preview`, then open `http://localhost:4173/fanjian-notes/`. To return to root-path development, run `Remove-Item Env:VITE_BASE_PATH` before `pnpm dev`.

For another repository or custom domain, update `VITE_BASE_PATH` in the workflow and the site links in both READMEs; use `/` for a root-domain deployment. The model manifest uses relative paths. Icons, Worker, WASM, PWA launch URL and cache scope share the configured base. OCR cache names are also isolated by project path.

Node.js 22.12+ is required; CI uses Node.js 22 and pnpm 11.25.0. Linux OCR fixture tests install Noto CJK system fonts. No credential file or custom deployment key is needed; Pages uses short-lived workflow authorization.

After the first online visit, cache all resources in the offline model manager and confirm the application files are ready before testing a cold offline launch. GitHub Pages provides HTTPS for camera permission requests; actual device permissions, memory limits and system installation still require phone testing.

Official references: [Vite GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages), [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages).
