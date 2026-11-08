[简体中文](GUIDE.zh-CN.md) | **English**

# Fanjian Notes: user and developer guide

The mobile-first PWA overlays small Simplified Chinese hints on an original photo. The photo and SVG share a natural-pixel coordinate system and a single zoom / pan transform. Only characters that differ receive hints by default.

## Local setup

Use Node.js 22.12 or later. Dependencies and official model assets require an initial internet connection; inference needs no account, API key or cloud OCR service.

```powershell
pnpm install
pnpm run assets:ocr
pnpm dev
```

Open `http://localhost:5173`. npm is also supported: `npm install` and `npm run dev`; the predev hook prepares model assets automatically. `npm run assets:ocr` can run preparation explicitly. Prepared resources are reused. Models download from Paddle's official asset host and are then served with the application; photos and recognized text are never included in those requests.

Both npm overrides and pnpm-workspace.yaml pin ONNX Runtime to match the SDK's bundled Worker. A pnpm lockfile is provided. For GitHub Pages and a non-root base path, see [deployment instructions](DEPLOYMENT.en.md).

## Reading workflow

- Use the rear camera or import a photo. If camera access fails, the system camera / photo file chooser remains available. Browser image decoding applies supported EXIF orientation.
- Rotate in 90-degree steps and crop a rectangular region before recognition. Inputs are limited to 30 MB. The working photo is resized to at most 2400 pixels on its longest side and 5 million total pixels; OCR input is limited to 1600 pixels and 2.2 million pixels. This preserves the photograph rather than replacing it with text, but does resize and re-encode it for memory safety.
- Official PaddleOCR.js 0.4.2 runs PP-OCRv5 Mobile detection and recognition in its dedicated Worker using single-threaded WASM. Instances are reused. Tasks can be cancelled or retried and time out if processing takes too long.
- OpenCC converts complete lines with `twp → cn`, including Taiwan vocabulary such as `軟體 → 软件`. Unicode character sequences are aligned afterwards. Multiple optimal alignments and non-bijective edits become phrase hints.
- Character positions use quadrilateral interpolation, mixed-width fallback and limited local pixel projection. Position confidence remains conservative. Horizontal hints appear above the source; vertical hints appear to its right.
- Pinch to zoom, drag with one finger, use a wheel or fit the photo to the viewport. Photo and SVG annotations share the same transform.
- Tap a hint to inspect source text, conversion and OCR / positioning confidence. Correct a whole recognized line, change its direction, adjust annotation offsets, hide / delete individual hints or restore them from the annotation list. Changing line text regenerates that line's annotations.
- Adjust size, color, opacity and a light background. Canvas PNG / JPEG export uses the same layout as SVG, includes the complete processed photo and currently visible hints, and is independent of viewport zoom.
- IndexedDB stores photos, recognized lines, annotations, corrections, style and view state. Recognition saves automatically; use Save during reading. Returning home also saves.

The home-page sample is generated with Canvas and preset text / coordinates. It is explicitly marked as a demonstration, not as an OCR result.

## HTTPS, installation and offline use

```powershell
pnpm build
pnpm preview
```

Production preview runs at `http://localhost:4173`. Development mode does not enable the Service Worker; test full offline behavior using a production build. `dist/`, including all of `dist/ocr/`, can be served by a trusted HTTPS static host without a backend. Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`; missing model URLs must not return the home page. Single-threaded WASM does not require COOP / COEP.

For local phone tests on the same Wi-Fi, install [mkcert](https://github.com/FiloSottile/mkcert) and create a certificate containing the computer's current LAN IP. Replace this example address:

```powershell
mkcert -install
New-Item -ItemType Directory -Force .cert
mkcert -key-file .cert/dev-key.pem -cert-file .cert/dev.pem localhost 127.0.0.1 192.168.1.100
pnpm run dev:https
```

Open `https://COMPUTER-IP:5173` on the phone. Install and trust the **public rootCA.pem** from `mkcert -CAROOT` on your test phone. Never transfer rootCA-key.pem or dev-key.pem. iOS also requires enabling full certificate trust in Settings → General → About → Certificate Trust Settings. Android installation varies by vendor. Allow LAN access through the computer's firewall.

If `.cert/dev.pem` and `.cert/dev-key.pem` are absent, HTTPS mode generates a temporary self-signed certificate for quick desktop checks. That does not guarantee usable camera permissions or Service Workers on phones. Use trusted certificates or the deployed HTTPS site.

For installation and offline testing, run `pnpm build` followed by `pnpm run preview:https`, then open `https://COMPUTER-IP:4173`. Keep the same base-path environment variable if testing a project deployment.

1. While online, download all offline model resources (approximately 67.1 MiB) and wait for application file caching to complete.
2. Perform a real recognition, close the page, disconnect and open the same address again. Import another photo and recognize it.
3. Check hints, corrections, saving and export. Storage belongs to the exact protocol, host and port, so switching addresses does not migrate records.
4. On iPhone Safari, use Share → Add to Home Screen. On supported Android browsers, use the install / home-screen menu.

All OCR, text conversion, coordinate computation, export and reading records remain local. There are no analytics SDKs. Static hosting may retain access logs for application/model requests. Browsers may evict caches under storage pressure; persistent-storage requests can be denied. Check readiness before relying on offline use.

## Project layout

```text
src/camera/             camera capture and permission fallback
src/image-processing/   decoding, resizing, rotation/crop, perspective contract
src/ocr/                official SDK adapter, normalization and cache management
src/text-conversion/    whole-line OpenCC, sequence alignment and phrase fallback
src/alignment/          CharacterAlignmentEngine and geometry/view transforms
src/annotation/         collision layout and SVG layer
src/export/             Canvas composition
src/storage/            IndexedDB records
src/ui/                 preprocessing, reader, model manager and demonstration
src/paths.ts            root/project deployment resource paths
src/sw.ts               application precache and scoped OCR resource routing
tests/unit/             conversion, alignment, geometry, normalization and paths
tests/e2e/              key interactions and real offline OCR
scripts/prepare-ocr.mjs official asset preparation, version checks and digests
public/ocr/             generated runtime/model files, excluded from Git
dist/                   production static deployment
```

## Verified SDK contracts

Implementation was checked against the installed SDK README, TypeScript declarations and actual runtime code, and OpenCC's README and types. No character-level detection API is assumed.

- [Official PaddleOCR browser SDK](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js/packages/core): version 0.4.2 explicitly maps `chinese_cht::PP-OCRv5` to the same official mobile pair as `ch`; it is not a separate Traditional-only model.
- The adapter calls `PaddleOCR.create({worker:{createWorker},initialize:false,...})`, then `initialize()` and `predict(canvas, params)`. Prediction returns an array of results with line items `{text, poly, score}`.
- Local model URLs require explicit model names matching `model_name` in each archive's `inference.yml`.
- The published official Worker embeds ONNX Runtime 1.24.3, so the matching `.mjs` / `.wasm` assets are pinned to that version. The official Worker is copied without changing its implementation or protocol.
- [OpenCC.js](https://github.com/nk2028/opencc-js) provides the typed `Converter({from:'twp',to:'cn'})` configuration.

## Validation and current limits

```powershell
pnpm run typecheck
pnpm test
pnpm exec playwright install chromium
pnpm build
pnpm run test:e2e
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium / Edge binary. The tests generate their own input images and run genuine local OCR, without injecting recognition results or reading personal photos. See the [test report (Chinese)](../TESTING.md) for completed runs and their limits.

- Character positions are geometric estimates with modest projection refinement, not true character detections. Position scores are not calibrated statistical probabilities. Latin text, numbers, whitespace, punctuation, irregular fonts and spacing reduce reliability.
- Dense lines, curved pages and image boundaries can still produce collisions. Layout tries to avoid them, with light backgrounds and manual offsets available. Phrase hints can be long.
- Vertical direction is inferred from line geometry. OCR may split columns or misread characters; line direction and recognized text are editable. A real-phone vertical-text sample evaluation is still pending.
- Perspective correction currently has only the `PerspectiveCorrector` extension contract; four-corner editing is not available. There is no live video OCR.
- The current stable backend is single-threaded WASM. WebGPU is not enabled. Initial SDK/model setup remains substantial and needs real-phone memory and timing measurements.
- A browser may decode an entire highly compressed image before downsizing, so a 30 MB file limit does not eliminate all extreme-image memory peaks.
- Real iPhone / Android camera use, Safari memory limits, system PWA installation and physical offline tests require device verification; desktop touch emulation cannot replace them.

Priorities are real-device memory / sample testing, stronger character localization, vertical column merging / reading order, and perspective correction.
