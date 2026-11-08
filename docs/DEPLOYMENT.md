**简体中文** | [English](DEPLOYMENT.en.md)

# GitHub Pages 部署

站点：<https://drivinggodj.github.io/fanjian-notes/>。仓库：<https://github.com/DrivingGodJ/fanjian-notes>。

推送到 `main` 或手动运行 `Test and deploy GitHub Pages` 会按锁文件安装依赖，检查类型与算法，下载官方模型，构建 `/fanjian-notes/` 子路径版本，并在同一路径运行真实 OCR / 离线交互测试。所有检查成功后才会上传 `dist/` 并部署到 `github-pages` 环境。Pages 的发布源为 GitHub Actions。

模型与 SDK / WASM 资源在 CI 中准备并随网站部署。模型归档在构建间缓存并核对固定 SHA-256；缺失时从官方地址重试下载，或从本站已发布版本取回完全一致的文件，不提交模型大文件到源码仓库。浏览器只请求同源静态文件；照片和 OCR 文本不进入 Actions 或服务器。

## 本地复现项目路径

```powershell
pnpm install
$env:VITE_BASE_PATH='/fanjian-notes/'
pnpm run assets:ocr
pnpm run typecheck
pnpm test
pnpm build
pnpm run test:e2e
```

预览时保留同一环境变量，运行 `pnpm preview`，打开 `http://localhost:4173/fanjian-notes/`。恢复根路径开发时执行 `Remove-Item Env:VITE_BASE_PATH`，再运行 `pnpm dev`。

部署到其他仓库或自定义域名时，同步修改工作流的 `VITE_BASE_PATH` 和 README 中的站点入口；根域名使用 `/`。模型清单采用相对路径，图标、Worker、WASM、PWA 启动页和缓存作用域统一使用该路径。OCR 缓存名称也按站点路径隔离。

需要 Node.js 22.12+；工作流使用 Node.js 22、pnpm 11.25.0。Playwright 的 Linux OCR 图片测试安装 Noto CJK 系统字体。没有配置凭据文件，也不需要自定义发布密钥，Pages 使用工作流短期授权。

第一次在线打开后，在“离线模型”中等待模型资源完整缓存，同时确认应用离线文件就绪，再验证断网重开。GitHub Pages 的 HTTPS 可用于相机权限，但真实设备权限、内存与系统安装仍需手机验收。

官方参考：[Vite GitHub Pages](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages)。
