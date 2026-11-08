[简体中文](README.md) | **English**

# Fanjian Notes · 繁简旁注

Photograph Traditional Chinese text and add small Simplified Chinese reading hints. Keep the original photo and annotate only characters that change.

[Try the app](https://drivinggodj.github.io/fanjian-notes/)

![The Fanjian Notes home screen with camera, photo import and annotation examples](docs/screenshots/home.png)

## Read the photo, with a little help

Capture a book page, sign or menu, or import an existing photo. Text recognition runs locally on your device. Small Simplified Chinese hints appear above horizontal text and to the right of vertical text. The photo and annotations share the same zoom and pan transform, preserving the original layout.

For example, 「這是一個美麗的世界」 receives only three hints: 「這 → 这」, 「個 → 个」 and 「麗 → 丽」. Conversion processes the whole line for context before aligning character sequences; uncertain mappings become phrase hints.

## Make the page easier to read

- Rotate and crop photos; adjust annotation size, color, opacity and light backgrounds.
- Tap a hint to inspect its source, conversion and confidence; correct recognized text, adjust positions or hide individual hints.
- Save your reading state locally or export the photo with its visible annotations as PNG / JPEG.
- Install the PWA and recognize text offline after caching the application and approximately 67.1 MiB of model resources.

Character locations currently use quadrilateral geometry and limited pixel refinement. Complex layouts may need manual correction. Real-phone performance and vertical-text samples still need broader evaluation.

## Try it

Open the [online application](https://drivinggodj.github.io/fanjian-notes/) on your phone and choose the camera or photo import. The sample reading page lets you try zoom, corrections and export first; it explicitly uses preset text and is not presented as an OCR result.

No account, API key or paid OCR is required. Photos, recognized text and reading records are not uploaded. GitHub Pages serves only application and model files; the hosting provider may still retain access logs for those files. Browsers can evict cached resources, so check the cache before relying on offline use.

## Explore further

| Topic | Documentation |
| --- | --- |
| Local setup, phone HTTPS, installation and limitations | [User and developer guide](docs/GUIDE.en.md) |
| Automatic publishing, project paths and model assets | [GitHub Pages deployment](docs/DEPLOYMENT.en.md) |
| Types, algorithms and real offline OCR tests | [Test report (Chinese)](TESTING.md) |
| Feedback | [Issues](https://github.com/DrivingGodJ/fanjian-notes/issues) |

Built with React, PaddleOCR.js, OpenCC, SVG, Canvas and browser-local storage. Dependency and model sources are listed in the guide.
