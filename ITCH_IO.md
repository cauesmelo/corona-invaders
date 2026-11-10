# Corona Invaders 3D itch.io build

This project exports independently. Run `npm run build:itch` here, then upload `dist/corona-invaders-itch.zip` as an HTML Game on its own itch.io page. There is no shared launcher or server runtime in the ZIP.

The entry is root `index.html`. The current export holds 28 files (about 0.55 MiB): runtime modules, `vendor/` Three.js r187 plus its license, and the Markdown docs (including the bullet-hell brief). All lettering is generated SVG (the original 16×16 corona and syringe sprites are transcribed as SVG pixels) and all audio is synthesized, so the game uses no font, image or audio files and loads nothing from a CDN. The exporter normalizes runtime module extensions to `.js`, preserves asset bytes, and writes the unpacked site to `dist/itch/` plus a hash/size report to `dist/build-report.json`.

Standalone index.html is a plain green page with only the actual game centered. The same game fills its iframe, with its HUD and controls inside the game surface; no surrounding website or shared launcher is included.

Use Click to Play, an initial 960×640 embed and fullscreen support. Embedded mode is detected automatically; `index.html?embed=1` lets you inspect it directly. Test the uploaded draft preview before publishing. Do not enable Mobile Friendly solely on the basis of desktop touch emulation.

The runtime has no CDN, account, API key, backend, Node process or cross-origin isolation requirement. Start/audio input is user-initiated. This WebGL game requires WebGL2; its initialization fallback is visible when unavailable.

The package excludes local development servers, tests, Node dependencies and build tools. Keep those development files outside the upload. Rebuild the ZIP after edits; editing source does not update a previously generated/uploaded archive.

The full workspace contains detailed deployment rationale in `../common/docs/ITCH_IO.md`, validation evidence in `../common/docs/VALIDATION.md`, and shared continuity in `../common/SHARED_MEMORY.md`. These documents are optional when copying this project elsewhere. Official upload reference: https://itch.io/docs/creators/html5
