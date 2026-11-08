# 验证记录

验证日期：2026-11-08。环境：Windows、Node.js 24.22.1、Microsoft Edge 157（Playwright 驱动）。手机布局使用 390 × 844 视口与触控模拟，这是桌面测试报告。

| 检查 | 结果 |
| --- | --- |
| `pnpm install` | 通过；依赖脚本仅允许 esbuild 与 protobufjs |
| `pnpm run typecheck` | 通过 |
| `pnpm test` | 28 / 28 通过，4 个测试文件（包含部署路径） |
| `pnpm run build` | 通过，生成 dist 和正式 Service Worker |
| `pnpm run test:e2e` | 5 / 5 通过，项目子路径下约 21 秒；使用现有 Edge 可执行文件 |
| HTTPS 相机流程 | 本机 HTTPS 安全上下文 + 模拟媒体设备，拍摄进入预处理成功 |
| 真实 OCR | 官方 PP-OCRv5 Mobile 在浏览器 Worker 中实际推理 |
| 离线 OCR | 缓存完整后模拟断网、页面冷重载，再次执行真实识别成功 |
| 网络审计 | 识别测试请求均为同源 GET / Blob，没有上传或第三方请求 |
| 图片导出 | PNG 下载成功，1200 × 1500；已目视检查照片与旁注位置 |

真实 OCR 测试通过 Canvas 生成输入图片，没有注入虚构 OCR 结果。实际输出：

```text
這是一個美麗的世界
頭髮發展電腦與軟體
```

第一行的注释对象严格为 `這 → 这`、`個 → 个`、`麗 → 丽`，共 3 个。第二行输入中的空格被模型省略，属于实际 OCR 输出。

自动交互测试涵盖：首页无横向溢出、示例入口、缩放按钮、真实双指触控事件、共享图片 / SVG 变换、全局显示隐藏、点击旁注、单处隐藏恢复、原文纠错、旁注颜色、PNG 导出、本地保存与重载恢复、相机文件后备入口、旋转裁剪、取消任务、桌面布局、真实 OCR 和离线冷启动。

已修复实际暴露的问题：自定义模型 URL 必须提供模型名称；模型清单需主动缓存；`Vary: Origin` 会导致下载请求与模块导入错配，验证后的同源资源现已移除有关传输头，SW 的 OCR 资源匹配也会忽略 Vary。

构建仍有上游 OpenCV Node 模块外置提示和 OCR 大代码块提示；已验证浏览器实际推理。主界面与 OCR 代码分开加载，模型资源约 67.1 MiB，应用预缓存另约 10.8 MiB。

## 尚待真机检查

- iPhone Safari / Android Chrome 在可信 HTTPS 下的真实后置相机、相册权限、EXIF 方向和 HEIC 解码。
- 首次初始化耗时、内存峰值、后台恢复与系统清理缓存后的恢复。
- 系统安装 PWA、开启飞行模式后关闭重开并再次识别。
- 真实竖排书页、弯曲纸张、反光、透视、密集排版与不规则字距的识别和定位质量。

## 复现

```powershell
pnpm install
pnpm run assets:ocr
pnpm run typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm run test:e2e
```

本机以 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向已安装 Edge；未设置时使用 Playwright Chromium。手机 HTTPS 操作见 [README.md](README.md)。
