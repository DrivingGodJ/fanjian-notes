[简体中文](README.md) | **English**

# Fanjian Notes · 繁简旁注

Photograph Traditional Chinese text and add small Simplified Chinese reading hints. Keep the original photo and annotate only characters that change.

[Try the app](https://drivinggodj.github.io/fanjian-notes/)

![The Fanjian Notes home screen with camera, photo import and annotation examples](docs/screenshots/home.png)

## Read the photo, with a little help

Capture a book page, sign or menu, or import an existing photo. Text recognition runs locally on your device. Small Simplified Chinese hints appear above horizontal text and to the right of vertical text. The photo and annotations share the same zoom and pan transform, preserving the original layout.

For example, 「這是一個美麗的世界」 receives only three hints: 「這 → 这」, 「個 → 个」 and 「麗 → 丽」. Conversion processes the whole line for context before aligning character sequences; uncertain mappings are retained as phrase hints for manual review.

## Make the page easier to read

- Automatically rectify page perspective and curvature with local UVDoc, preview the result and undo it if needed before OCR. Separate controls handle tilt within ±12°, rotation and cropping.
- Adjust annotation size, color, opacity and light backgrounds. Crowded hints shrink or are suppressed rather than moving into neighboring columns.
- Tap a hint to highlight its source glyph, correct text, tap the original glyph to set its position, adjust offsets or hide individual hints.
- Save your reading state locally or export the photo with its visible annotations as PNG / JPEG.
- Install the PWA and recognize text offline after caching the application and approximately 67.2 MiB of OCR resources.
- The interface and reading hints use locally hosted Source Han Serif, cached for offline use. Light and dark modes follow the system automatically while photos retain their original appearance.
- iOS home-screen artwork uses a book with 「書 / 书」 annotation: [design preview](docs/screenshots/icon-preview.png) · [1024px master](public/icon-1024.png).

![Source Han Serif and the automatic dark appearance](docs/screenshots/home-dark.png)

Character positions combine recognition timing, image pixels and source-text matching to reduce errors from omissions, punctuation and uneven spacing. Unmatched or unreliable positions are held for review. Older readings are automatically realigned while preserving manual positions and visibility; a realign button is also available. The optional rectification model adds about 30.2 MiB and works offline after caching. Positions remain estimates rather than true character detections; complex layouts need review and real-phone evaluation is ongoing. See [rectification and positioning details (Chinese)](docs/RECTIFICATION.md).

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
