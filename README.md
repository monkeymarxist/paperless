# Paperless — local copy (build 22)

A browser-only PDF toolkit: edit existing text, move and crop images, round-trip
an image through an external editor, convert a document to editable Word,
read a scan with OCR, reorder/rotate/delete pages, merge, split, convert to and
from images, compress, and add text/marks. No server, no upload — every document stays in the browser tab.

## Run it

Any static web server will do. From this folder:

    python3 -m http.server 8000
    # then open http://localhost:8000

Node, if you prefer:

    npx serve .

`file://` will **not** work: pdf.js runs its renderer in a Web Worker, and
browsers block worker loading from the file protocol.

## What's here

    index.html   markup, design tokens, all CSS (light + dark)
    app.js       all application logic
    lib/
      pdf.min.js         pdf.js 3.11.174 (legacy UMD) — rendering + text extraction
      pdf.worker.min.js  its renderer worker
      pdf-lib.min.js     pdf-lib 1.17.1 — PDF writing
      jszip.min.js       JSZip 3.10.1 — multi-file export bundles
      tess/              Tesseract 5 (tesseract.js 5.1.1) — OCR, ~13 MB,
                         fetched only when the Read a scan tool is opened
    samples/     small PDFs used by the tests
    tests/       the headless regression harness (see below)

No build step and no npm install for the app itself — the four libraries are
vendored, deliberately: pdf.js needs its worker served from the same origin.

## Difference from the hosted version

One function differs. On claude.ai the sandbox blocks a frame from starting its
own downloads, so saving goes through the platform's `downloads` capability. This
copy keeps that path but falls back to an ordinary `<a download>` link when
`window.claude` is absent — which is what happens on any normal host. See
`offerFile()` near the top of `app.js`.

Fonts (Archivo, IBM Plex Mono) load from Google Fonts. Offline, the page falls
back to the system UI font and still works; to make it fully self-contained,
download the two families into `lib/fonts/` and swap the `<link>` in
`index.html` for a local `@font-face` block.

## How text editing works

1. `pdf.js getTextContent()` gives per-run glyph positions and the embedded font
   name for a page.
2. Runs are merged into lines (same baseline, same face, adjacent x), lines into
   paragraphs. A paragraph is treated as reflowable ("soft" breaks) when every
   line but the last fills ≥82% of the block width; otherwise line breaks are
   kept hard.
3. Clicking a block opens a contenteditable overlay at the document's own font
   size, line height and colour — the colour sampled from the rendered canvas
   (dominant *solid* pixel, antialiasing excluded).
4. On commit, a white (paper-coloured) rectangle covers the old block and the new
   text is drawn with pdf-lib. Patch geometry is derived from the baseline
   (0.80 em above, 0.24 em below) and clamped by `nextBlockTop()` so it can never
   erase the line underneath.

Embedded fonts cannot be reused — re-subsetting an embedded face is beyond
pdf-lib — so each face is mapped to one of the 14 standard fonts, with an
x-height ratio table (`FACE_SCALE`, 61 faces) picking the point size that keeps
the apparent letter height. Weight is classified regular / semi / bold from the
face name; semi is simulated by overprinting. Greek and maths characters fall
back to the Symbol font, since the standard faces are WinAnsi-encoded.

## Tests

The harness drives the real app in headless Chromium and measures the result
against PDFs built with known fonts, sizes and colours. It needs Playwright and
Chromium available to Node:

    cd tests
    npm install @pdf-lib/fontkit
    node smoke.js        # end-to-end: render, edit, export, re-parse
    node probe27.js      # the current text-editing regression

`probe.js` … `probe27.js` are the diagnostics accumulated while building it, kept
because each one pins down a specific defect: font-size inflation on selection,
colour loss, the patch overshooting into the line below, lost bold/colour on
mixed-format lines, block moves leaving ink behind, Greek turning into question
marks. Several hardcode `/opt/pw-browsers/chromium` and Linux font paths; adjust
`executablePath` and the paths in `FONTS` for your machine.

## How PDF → Word works

A .docx is a zip of XML parts, so the conversion runs here too — JSZip writes the
package. Glyph positions from pdf.js are rebuilt into lines, lines into
paragraphs (the same grouping the editor uses), and paragraphs into
WordprocessingML. Blocks that share a row are joined into one tabbed paragraph
with real tab stops, so table rows survive as rows rather than a staircase of
indents. Headings come from size relative to the document's median body size,
lists from the leading bullet or number, colour from sampling the rendered page,
and pictures are cut from a 2× render (JPEG above 300×300px, PNG below).

Two shapes:

- **Editable flow** — paragraphs re-wrap as you type. Best for reworking the text.
- **Keep layout** — every block is pinned where the PDF put it with `w:framePr`.
  Page-for-page identical, awkward to re-edit.

Unlike the PDF writer, .docx is Unicode throughout, so Greek and other non-Latin
text survives the trip. Tables arrive as tabbed paragraphs, not Word tables.

## How Read a scan (OCR) works

Tesseract runs as WebAssembly in the tab. The engine, the worker and the English
model are all served from this folder — nothing is fetched from a CDN and no page
image is uploaded.

Each page is rendered at the chosen DPI and recognised. Tesseract returns every
line and word with a bounding box, which feeds two things:

- **on screen** — one transparent span per line, positioned and horizontally
  scaled onto the ink, exactly the technique pdf.js uses for its own text layer.
  Select and copy straight from the page as soon as a page finishes.
- **in the saved PDF** — every word drawn with `TextRenderingMode.Invisible`
  over the picture. That is how a searchable scan is built: the page looks
  untouched (verified pixel-for-pixel) but readers can select, copy and search it.

A page that already carries its own text is skipped; its overlay is built from
the document's own text layer instead, so selection behaves the same either way.

Two local notes:

- The model is named `lib/tess/lang/eng.traineddata.wasm`, not `.traineddata`.
  The host the hosted copy is published on only serves a fixed list of file
  extensions, so the model ships under one of them and `ocrModel()` fetches it
  by hand and hands the bytes to the worker. The loader tries the plain name as
  a fallback, so renaming it back works on your own server.
- `lib/tess/worker.min.js` carries a one-token fix to an upstream bug: when a
  language is supplied as `{code, data}` rather than a name, tesseract.js 5.1.1
  passes the *bytes* where the language *name* belongs, and initialisation
  fails. The patch is marked in this README only — search the file for
  `"string"==typeof t?t:t.code`.

## Known limits

- Original embedded fonts are substituted, not preserved (see above). Font,
  weight, size and colour controls are provided so a mismatch can be corrected
  by hand.
- A scanned PDF still has no text layer for the *editor* to work on. Run it
  through Read a scan first, save the searchable file, and the text is then
  selectable — though the editor's patch-and-redraw works on the OCR layer, not
  on the picture, so visible edits to a scan still mean covering and retyping.
- OCR is English only here. Adding a language means dropping its
  `<code>.traineddata` beside the English one and offering it in the panel.
- Compression re-encodes images; it does not rebuild the object streams.

## Licence

© 2026 Monkey Marxist · [@monkeymarxist](https://x.com/monkeymarxist) · [AGPL-3.0](https://monkeymarxist.github.io/p2pchat/LICENSE.txt)

The vendored libraries keep their own licences: pdf.js and pdf-lib (Apache-2.0 / MIT),
JSZip (MIT or GPLv3), Tesseract and tesseract.js (Apache-2.0).
