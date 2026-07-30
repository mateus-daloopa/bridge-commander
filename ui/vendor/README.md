# Vendored libraries

The UI is zero-CDN: everything it runs is served from this repo. Each file below is an
unmodified upstream build, fetched with `npm pack <name>@<version>` and copied out of the
tarball. To update: repack, copy, and bump the line here.

- marked.umd.js — marked v18.0.6 (MIT) — https://github.com/markedjs/marked — `npm pack marked@18.0.6` → `package/lib/marked.umd.js` (v16+ no longer ships a minified build; the UMD is 43 KB)
- purify.min.js — DOMPurify v3.4.12 (Apache-2.0 OR MPL-2.0) — https://github.com/cure53/DOMPurify — `npm pack dompurify@3.4.12` → `package/dist/purify.min.js`
- highlight.min.js — highlight.js v11.11.1, common-languages build (BSD-3-Clause) — https://github.com/highlightjs/highlight.js — `npm pack @highlightjs/cdn-assets@11.11.1` → `package/highlight.min.js`
- mermaid.min.js — mermaid v11.16.0 (MIT) — https://github.com/mermaid-js/mermaid — `npm pack mermaid@11.16.0` → `package/dist/mermaid.min.js`
- codemirror/ — CodeMirror v5.65.21 (MIT) — https://github.com/codemirror/codemirror5 — `npm pack codemirror@5.65.21` → `package/{lib/codemirror.js,lib/codemirror.css,mode/meta.js,addon/mode/loadmode.js,mode/<lang>/<lang>.js}`. CodeMirror 5, not 6: 5 is a single UMD file plus one file per language, which is what a board with no build step can serve. No theme file is vendored — the board's own palette is the `cm-s-bc` theme in app.css. Languages present: clike, css, diff, dockerfile, go, htmlmixed, javascript, jsx, lua, markdown, perl, php, properties, python, ruby, rust, shell, sql, toml, xml, yaml — drop another `mode/<lang>/<lang>.js` in to add one.

- react.production.min.js, react-dom.production.min.js — React 18.3.1 (MIT) — https://github.com/facebook/react — `npm pack react@18.3.1 react-dom@18.3.1` → `package/umd/{react,react-dom}.production.min.js`. React 18, not 19: 19 dropped the UMD builds, and a UMD that sets `window.React` is the only form a no-build-step page can load. Only here because Excalidraw needs it.
- excalidraw/ — Excalidraw v0.17.6 (MIT) — https://github.com/excalidraw/excalidraw — `npm pack @excalidraw/excalidraw@0.17.6` → `package/dist/{excalidraw.production.min.js,excalidraw-assets/}`. 0.17, not 0.18: 0.18 ships ESM with ~28 bare-specifier imports (react, jotai, roughjs, …) and can only be loaded through a bundler. 0.17 is the last UMD release — it takes `window.React`/`window.ReactDOM` and hands back `window.ExcalidrawLib`. `excalidraw-assets/` holds the woff2 fonts plus the lazy `vendor-*.js` chunk the bundle fetches on mount; `window.EXCALIDRAW_ASSET_PATH` must point at that directory before the bundle initialises. The 60-odd `locales/` files are deliberately NOT vendored — English is baked into the main bundle.

marked + purify load as classic scripts in index.html (globals — they are needed by every
markdown surface). highlight and mermaid are lazy-loaded by `ui/js/md.js` only when rendered
content actually contains a fenced code block / a ```mermaid fence. CodeMirror is lazy-loaded
the same way by `ui/js/fileedit.js`, on the first file editor opened — and its language modes
one at a time after that.

React + Excalidraw are loaded by nothing the board ships. They exist only for the spike page
`ui/excalidraw-spike.html`, which answers whether a React component can run here without a
build step. If that spike is not taken forward, delete `react*.js`, `react*.LICENSE`,
`excalidraw/` and `excalidraw.LICENSE` — nothing else references them.
