**简体中文** | [English](GUIDE.en.md)

# 繁简旁注

在原照片上叠加小号简体旁注的手机优先 PWA。照片与 SVG 使用同一套自然像素坐标和同一组缩放、平移变换。原文始终来自照片，默认只给繁简不同的汉字加旁注。

## 启动

需要 Node.js 22.12+。首次准备依赖及模型需要联网；应用运行时不需要账号、API Key 或任何云端 OCR 服务。

```powershell
npm install
npm run dev
```

打开终端显示的 `http://localhost:5173`。`predev` 会自动准备官方模型、Worker、配套 WASM 和图标。也可单独执行 `npm run assets:ocr`。已准备资源会复用；模型仅从 Paddle 官方地址下载，用户照片与文本从不参与此下载。

如果使用 pnpm：`pnpm install`、`pnpm run assets:ocr`、`pnpm dev`。项目同时在 package.json 的 overrides 和 pnpm-workspace.yaml 中固定 ORT 版本，避免 SDK 内置 Worker 和 WASM 不一致。包含 pnpm 锁文件。

## 可用功能

- 手机后置相机、系统拍照 / 相册文件后备入口；自动采用浏览器解码后的 EXIF 方向。
- 旋转与矩形裁剪；导入限制 30 MB，阅读图片最长边 2400 像素 / 总像素 500 万；OCR 最长边 1600 / 总像素 220 万。原图不会被翻译文字取代，但会为内存安全缩小与重新编码。
- 官方 PaddleOCR.js 0.4.2、PP-OCRv5 Mobile 检测与识别；WASM 单线程在官方专用 Worker 内推理；实例复用，支持取消、超时和重试。
- 整行 OpenCC `twp → cn` 转换，包含台湾词汇到大陆词汇转换（例如 `軟體 → 软件`）。先转换整行，再以 Unicode 字符序列对齐；多解与非一一对应编辑使用短语提示。
- 倾斜四边形插值、混合文字宽度降级、局部像素投影辅助、估算定位置信度；横排在上方、竖排在右侧。
- 双指缩放、单指拖动、滚轮缩放、适合屏幕；照片与旁注始终共享 SVG 变换。
- 修改识别原文、手动切换行方向、微调旁注位置、隐藏 / 删除与恢复单个旁注；字号、颜色、透明度、淡色背景。
- Canvas 导出 PNG / JPEG，与 SVG 共用标注布局；导出完整处理后照片，包含当前可见旁注，不受屏幕缩放影响。
- IndexedDB 阅读记录、照片、修改、旁注样式与视图位置；识别结束自动保存，阅读时手动保存，返回首页保存。
- 可安装 PWA、离线资源下载与 SHA-256 校验、缓存状态与持久存储申请。无分析 SDK、无照片上传、无登录。

点击首页的“体验示例”可直接试用交互。示例使用 Canvas 生成的纸页与预置文本 / 坐标，界面明确标注为示例，**不是 OCR 测试结果**。

## 手机 HTTPS 与离线测试

### 正式构建

```powershell
npm run build
npm run preview
```

预览地址 `http://localhost:4173`。开发模式不启用 Service Worker，必须使用正式构建验证完整离线功能。可将 `dist/` 原样部署到可信 HTTPS 静态服务器，无需后端，必须连同 `dist/ocr/` 一起部署。

服务器需要正确提供 `.mjs` 为 JavaScript、`.wasm` 为 `application/wasm`；不要把不存在的模型 URL 重写为首页。建议 HTTPS 响应添加 `Content-Security-Policy: connect-src 'self' blob:; worker-src 'self' blob:`，进一步限制网络访问。WASM 使用单线程，不要求 COOP / COEP。

### 同一 Wi-Fi 下的本地可信 HTTPS

可用 `mkcert` 创建包含电脑局域网 IP 的开发证书。先按 [mkcert 官方说明](https://github.com/FiloSottile/mkcert)安装；以下 IP 必须替换为电脑当前 Wi-Fi 地址：

```powershell
mkcert -install
New-Item -ItemType Directory -Force .cert
mkcert -key-file .cert/dev-key.pem -cert-file .cert/dev.pem localhost 127.0.0.1 192.168.1.100
npm run dev:https
```

手机打开 `https://电脑IP:5173`。将 `mkcert -CAROOT` 目录下的 **rootCA.pem 公共证书** 安装到自己的测试手机并设为信任。不要传输 rootCA-key.pem 或 dev-key.pem。iOS 还需在“设置 → 通用 → 关于本机 → 证书信任设置”启用该开发根证书；Android 的证书安装入口因厂商而异。电脑防火墙需允许本地网络访问端口。

没有 `.cert/dev.pem` 与 `.cert/dev-key.pem` 时，`dev:https` 会生成临时自签证书；它只用于快速桌面检查，不保证手机相机 / Service Worker 可用。手机应使用已受信任证书或部署后的可信 HTTPS。

验证离线与安装使用生产预览，而不是开发服务器：

```powershell
npm run build
npm run preview:https
```

对应手机地址为 `https://电脑IP:4173`，同样需要证书包含这个 IP 并受信任。

1. 联网打开生产站点，在“离线模型”下载全部资源（约 67.1 MiB），等“应用离线文件”显示已缓存。
2. 先完成一次真实照片识别；再关闭页面、断网、重新打开同一地址，并导入另一张照片识别。
3. 检查旁注、修改、保存和导出。浏览器的同一“协议 + 主机 + 端口”才共享同一个缓存与记录。
4. iPhone Safari：分享菜单 → 添加到主屏幕；Android 支持的浏览器：菜单 → 安装应用 / 添加到主屏幕。

浏览器可能在存储压力下清理缓存。持久存储申请可能被拒绝；请在出行前检查资源是否齐全，不保证永久离线保存。

## 目录

```text
src/
  camera/             相机与权限失败后备入口
  image-processing/   解码、限尺寸、方向、旋转裁剪、透视模块契约
  ocr/                官方 SDK 适配、结果规范化、资源缓存
  text-conversion/    整行 OpenCC 转换、序列对齐、短语降级
  alignment/          CharacterAlignmentEngine、四边形与视图坐标
  annotation/         防碰撞布局与 SVG 图层
  export/             Canvas 图片合成
  storage/            IndexedDB 阅读记录
  ui/                 预处理、阅读、模型管理、示例与界面组件
  sw.ts               应用预缓存与 OCR 资源路由
tests/unit/           转换、字符对齐、定位、布局与坐标变换
tests/e2e/            关键交互及真实 OCR / 离线冷启动测试
scripts/prepare-ocr.mjs 官方资源准备、版本校验、摘要清单与图标
public/ocr/           自动生成的本地资源（不提交版本库）
dist/                 可直接部署的正式构建
```

## SDK 核实依据

已阅读安装包的 README、`dist/index.d.ts`、`pipelines/ocr/index.d.ts`、`core.d.ts`、`worker-backed.d.ts`、`runtime/ort.d.ts`、`model-asset.d.ts` 与实际实现，以及 opencc-js 的 README 和类型。没有使用假定存在的字符级检测接口。

- [PaddleOCR 官方浏览器 SDK 文档](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js/packages/core)
- SDK 0.4.2 的 `SUPPORTED_LANG_VERSION_MODELS` 明确支持 `chinese_cht::PP-OCRv5`；与 `ch` 映射到同一官方移动端检测 / 识别模型，**不是单独的繁体专用模型**。
- SDK 的实际接口：`PaddleOCR.create({ worker: { createWorker }, initialize: false, ... })`，随后 `initialize()`、`predict(canvas, params)`；`predict` 返回结果数组，行数据为 `{ text, poly, score }`。
- 自定义本地模型地址必须同时提供模型名称；配置中的 `model_name` 必须匹配 tar 内的 `inference.yml`。
- SDK 发布的官方 Worker 内置 ONNX Runtime 1.24.3，因此配套 `.mjs` 与 `.wasm` 固定相同版本。官方 Worker 原样复制、未修改协议或内部实现。
- [opencc-js 官方文档](https://github.com/nk2028/opencc-js)，采用其已有类型支持的 `Converter({ from: 'twp', to: 'cn' })`。

## 验证命令与限制

本次实际验证结果见 [TESTING.md](../TESTING.md)：类型检查、生产构建、28 项单元测试与 5 项交互测试全部通过，包括项目子路径下的真实 OCR 与离线冷启动。上线配置见 [GitHub Pages 部署](DEPLOYMENT.md)。

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定现有 Chromium / Edge 的绝对路径。自动测试会运行真正的本地 OCR，不模拟识别结果；不使用相册中用户的照片。

已知限制：

- 字符位置是行四边形上的几何估算，像素投影仅轻微修正中心，不能达到真实字符检测精度；低定位分数不是统计校准概率。英文、数字、空格、标点、字距不均与不规则字体会降低定位可信度。
- 复杂版面、弯曲书页、相互紧贴的行或图片边缘仍可能碰撞；布局尽量避让，空间不足时允许淡色背景及手动微调。短语提示可能较长。
- 竖排靠行几何推断，SDK 可能分行或认字不准，可修改行方向与原文；尚未完成真实手机竖排样本集评测。
- 透视校正仅保留 `PerspectiveCorrector` 接口，暂未开放四角拖拽；没有实时视频 OCR。
- 默认稳定的单线程 WASM，未启用 WebGPU。SDK 初次加载 / 初始化仍较重，手机性能和 iOS 内存占用需要真机测试。
- 读取超大压缩图片时，浏览器可能先解码全图再缩小；30 MB 文件限制不能完全避免极端图像的解码峰值。
- iPhone / Android 真机拍摄、Safari 浏览器内存上限、系统安装与系统实际断网尚需真机验证，桌面手机尺寸模拟不能替代这些检查。

下一步优先：真实 iOS / Android 样本与内存评测、字符级定位模型 / 更可靠的字间切分、竖排列合并和阅读顺序、透视校正。
