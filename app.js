/* Paperless — client-side PDF workbench.
   Rendering: pdf.js · Writing: pdf-lib · Bundling: JSZip
   Nothing in this file performs a network request. */
(() => {
'use strict';

const { PDFDocument, StandardFonts, rgb, degrees, BlendMode } = window.PDFLib;
const pdfjsLib = window.pdfjsLib;
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

/* ------------------------------------------------------------------ utils */
const $ = s => document.querySelector(s);
const h = (tag, attrs, ...kids) => {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    /* An aria- attribute is written even when it is false: aria-pressed="false"
       is a meaningful state, and the styling keys on the literal "true". Passed
       as a boolean it used to be dropped altogether, so every segmented control
       in the side panel rendered with nothing chosen. */
    if (k.startsWith('aria-')) { n.setAttribute(k, String(v)); continue; }
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'style') n.setAttribute('style', v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
};
const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
}

const SVG = {
  edit:   '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  pages:  '<rect x="3" y="3" width="7" height="8" rx="1"/><rect x="14" y="3" width="7" height="8" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  merge:  '<path d="M7 3v6a4 4 0 0 0 4 4h8"/><path d="M7 21v-6"/><path d="M16 10l3 3-3 3"/>',
  split:  '<path d="M6 3v7a4 4 0 0 0 4 4h8"/><path d="M6 21v-7"/><path d="M18 3l3 3-3 3"/><path d="M18 15l3 3-3 3"/>',
  image:  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/>',
  topdf:  '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14l2.5 2.5L16 12"/>',
  zip:    '<path d="M21 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"/><path d="M3 8l2-4h14l2 4z"/><path d="M12 12v4"/>',
  text:   '<path d="M4 6h16"/><path d="M12 6v14"/><path d="M8 20h8"/>',
  type:   '<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  retype: '<path d="M3 7V5h11v2"/><path d="M8.5 5v10"/><path d="M6 15h5"/><path d="M14.5 20.5H12v-2.5l6.2-6.2a1.8 1.8 0 0 1 2.5 2.5z"/>',
  hl:     '<path d="M4 20h16"/><path d="M9 16l-3 1 1-3 8.5-8.5a2.1 2.1 0 1 1 3 3z"/>',
  pen:    '<path d="M3 21s3-1 5-3 10-10 10-10a2.1 2.1 0 0 0-3-3S5 15 3 17s0 4 0 4z"/>',
  rect:   '<rect x="4" y="5" width="16" height="14" rx="1.5"/>',
  sign:   '<path d="M3 17c3 0 4-9 7-9s2 7 4.5 7S18 9 21 9"/><path d="M3 21h18"/>',
  erase:  '<path d="M4 15l6-6 8 8-3 3H7z"/><path d="M10 9l5-5 8 8-5 5"/><path d="M3 21h10"/>',
  cursor: '<path d="M5 3l6 17 2.5-6.5L20 11z"/>',
  rotl:   '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
  rotr:   '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  flipH:  '<path d="M12 3v18"/><path d="M9 7L4 12l5 5z"/><path d="M15 7l5 5-5 5z"/>',
  flipV:  '<path d="M3 12h18"/><path d="M7 9l5-5 5 5z"/><path d="M7 15l5 5 5-5z"/>',
  trash:  '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
  copy:   '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/>',
  left:   '<path d="M15 5l-7 7 7 7"/>',
  right:  '<path d="M9 5l7 7-7 7"/>',
  up:     '<path d="M5 15l7-7 7 7"/>',
  down:   '<path d="M19 9l-7 7-7-7"/>',
  save:   '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  undo:   '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 1 3 6.7"/>',
  redo:   '<path d="M21 7v6h-6"/><path d="M21 13a9 9 0 1 0-3 6.7"/>',
  plus:   '<path d="M12 5v14"/><path d="M5 12h14"/>',
  check:  '<path d="M20 6L9 17l-5-5"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomout:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/><path d="M8 11h6"/>',
  file:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  word:   '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.2 12l1.3 4 1.5-4 1.5 4 1.3-4"/>',
  scan:   '<path d="M3 8V5a2 2 0 0 1 2-2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2h-3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M7 9.5h10"/><path d="M7 13h10"/><path d="M7 16.5h6"/>',
  circle: '<circle cx="12" cy="12" r="8.5"/>',
  arrow:  '<path d="M4 20L20 4"/><path d="M13 4h7v7"/>',
  rub:    '<path d="M9.5 19H20"/><path d="M15.5 6.5l3 3a2 2 0 0 1 0 2.8L12 19H8l-3.2-3.2a2 2 0 0 1 0-2.8l7.9-7.9a2 2 0 0 1 2.8 0z"/>',
  chev:   '<path d="M9 6l6 6-6 6"/>',
  stamp:  '<path d="M8 13V8.5a4 4 0 1 1 8 0V13"/><path d="M5 13h14l1.6 5H3.4z"/><path d="M4 21h16"/>',
  line:   '<path d="M4 20L20 4"/>',
  callout:'<rect x="3" y="4" width="12" height="8" rx="1.5"/><path d="M15 12l5 7"/><path d="M20 19h-4m4 0v-4"/>'
};
function ico(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = SVG[name] || '';
  if (cls) s.setAttribute('class', cls);
  return s;
}

function toast(msg, bad) {
  const t = h('div', { class: 'tst' + (bad ? ' bad' : '') }, msg);
  $('#toast').append(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, bad ? 4200 : 2600);
  setTimeout(() => t.remove(), bad ? 4600 : 3000);
}

function modal(build, onClose) {
  const box = h('div', { class: 'sheetbox' });
  const back = $('#modal');
  clear(back).append(box);
  back.hidden = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.hidden = true; clear(back);
    document.removeEventListener('keydown', esc);
    /* Escape and a click on the backdrop close the sheet too, and nothing was
       told about it — which is how the rail was left with Sign still pressed
       after the signature pad was dismissed. */
    if (onClose) { try { onClose(); } catch (e) {} }
  };
  const esc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  back.onclick = e => { if (e.target === back) close(); };
  build(box, close);
  return close;
}

/* A confirmation the app draws itself. window.confirm is refused outright in a
   sandboxed frame — it returns false without ever asking — which is why
   deleting a saved signature appeared to do nothing at all. */
function confirmSheet(title, message, label, onYes) {
  modal((box, close) => {
    box.append(
      h('h3', null, title),
      h('p', null, message),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn danger', onclick: () => { close(); onYes(); } }, label)));
  });
}

/* --------------------------------------------------------- file delivery */
async function offerFile(filename, data) {
  let dl = null;
  try { dl = await window.claude?.use?.('downloads'); } catch (e) { dl = null; }
  if (!dl) {
    /* Standalone host: no platform save surface, so use an ordinary download link. */
    try {
      const blob = data instanceof Blob ? data
        : new Blob([data instanceof Uint8Array ? data : new Uint8Array(data)]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      toast('Saved ' + filename);
      return true;
    } catch (e) { toast('Could not save the file.', true); return false; }
  }
  try {
    await dl.save({ filename, data });
    toast('Saved ' + filename);
    return true;
  } catch (e) {
    const c = e && e.code;
    if (c === 'declined') return false;
    if (c === 'too_large') toast('That file is too large for this view. Try a lower resolution.', true);
    else if (c === 'rate_limited') toast('A save prompt is already open.', true);
    else toast('Could not save the file.', true);
    return false;
  }
}

/* ------------------------------------------------------------------ state */
const S = {
  doc: null,          // {name, bytes, pdf, pages:[{n,w,h}]}
  tool: null,
  annots: [], undoStack: [], redoStack: [],
  mode: 'select', sizeMode: 'match', ratioGroups: new Map(), cropping: null, sideClosed: false, overflow: 'wrap',   // let replacement text run on rather than shrink it
  fmt: { weight: null, italic: null, color: null, scale: 1 }, lastRun: null,
  drawSignature: null,              // the editor's signature pad, lent to the Stamp & sign sheet
  color: '#000000', calloutColor: '#f01124', fontSize: 16,   // BRIGHT_PALETTE[0]; the palette is declared below this object
  fontName: 'Helvetica', strokeW: 2.5, rubberW: 14,
  penSeen: false, penOnly: true, cancelStroke: null, touches: 0,
  zoom: 1, sel: null,
  pageEls: [],
  /* Mount lifecycle. Every tool is torn down by wbReset, which bumps `gen` and
     runs whatever the mount registered for cleanup — its stage listeners, its
     observers, the object URLs it made. An async job started under an earlier mount compares its own
     generation against this one and stops rather than drawing over whatever is
     on screen now. `keys` is what the keyboard shortcuts are allowed to do in
     the tool that is actually mounted. */
  gen: 0, cleanup: [], keys: null,
  ink: [], inkVolatile: false      // the saved signature/stamp library
};

/* Register a teardown for the current mount. */
function onCleanup(fn) { S.cleanup.push(fn); }

/* A guard an async run can check before it touches the screen again:
     const mine = ownsScreen();  …await…  if (!mine()) return;            */
function ownsScreen() {
  const g = S.gen, doc = S.doc;
  return () => g === S.gen && doc === S.doc;
}

const PALETTE = ['#000000', '#6b615d', '#8a0f14', '#0a74b8', '#1a7f4f', '#d08700', '#ffffff'];
const HL_PALETTE = ['#ffe44d', '#9cf27f', '#8fd4ff', '#ffb0d6', '#ffbb7a'];
/* A comment is meant to be seen at a glance against the page it sits on, so it
   gets its own palette with none of the muted inks in PALETTE — no black, no
   grey, no near-maroon, and no white, which would vanish on paper. */
const BRIGHT_PALETTE = ['#f01124', '#ff6a00', '#f5a300', '#00c853', '#0a84ff', '#7b3fe4', '#ff2d8e'];

/* A finger is not a mouse: coarse pointers get bigger targets and fewer steps. */
function coarsePointer() {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
}

function hex2rgb(x) {
  const m = x.replace('#', '');
  return rgb(parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255);
}

/* Blob URLs are not collected when the object holding them is dropped, so an
   editing session that placed and removed a dozen pictures kept every one of
   them alive. Data URLs (what the eraser hands back) need no release. */
function releaseAnnotURLs(list) {
  for (const a of list || []) {
    if (a && typeof a.url === 'string' && a.url.startsWith('blob:')) {
      try { URL.revokeObjectURL(a.url); } catch (e) {}
    }
  }
}

/* --------------------------------------------------------- document load */
async function setDoc(bytes, name) {
  const pdf = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const p = await pdf.getPage(i);
    const vp = p.getViewport({ scale: 1 });
    pages.push({ n: i, w: vp.width, h: vp.height });
  }
  if (S.doc && S.doc.pdf) { try { S.doc.pdf.destroy(); } catch (e) {} }
  /* Pictures placed on the old document held blob URLs. They have to outlive
     their mount — switching tool and back keeps the annotations — so they are
     released here instead, where the document they belonged to goes away. */
  releaseAnnotURLs(S.annots);
  S.doc = { name, bytes, pdf, pages };
  S.annots = []; S.undoStack = []; S.redoStack = []; S.sel = null; S.ratioGroups = new Map();
  return S.doc;
}

async function readFile(file) {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

async function openPdfFile(file) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    toast('That is not a PDF. Use Images → PDF for pictures.', true); return false;
  }
  try {
    const bytes = await readFile(file);
    await setDoc(bytes, file.name);
    return true;
  } catch (e) {
    const msg = /password/i.test(String(e && e.message))
      ? 'That PDF is password-protected. Remove the password in the app that made it, then try again.'
      : 'That file could not be read as a PDF.';
    toast(msg, true);
    return false;
  }
}

/* Cancelling the file dialog fires no change event, so this promise used to
   never settle: whoever awaited it waited for the life of the tab, and the tool
   that was waiting — Add image, Sign, every "Choose a file" — stayed stuck with
   its button pressed and had to be left and re-entered. The browsers that have
   a cancel event answer straight away; the rest are caught when focus comes
   back to the window with nothing chosen. */
function pickFile(accept, multiple) {
  return new Promise(res => {
    const inp = $('#filein');
    inp.value = '';
    inp.accept = accept || '';
    inp.multiple = !!multiple;
    let settled = false;
    const done = v => {
      if (settled) return;
      settled = true;
      inp.onchange = null; inp.oncancel = null;
      window.removeEventListener('focus', onFocus);
      res(v);
    };
    const onFocus = () => setTimeout(() => { if (!inp.files.length) done(multiple ? [] : null); }, 500);
    inp.onchange = () => done(multiple ? Array.from(inp.files) : inp.files[0] || null);
    inp.oncancel = () => done(multiple ? [] : null);
    window.addEventListener('focus', onFocus, { once: true });
    inp.click();
  });
}

function dropTarget(node, onFiles) {
  const on = e => { e.preventDefault(); node.classList.add('hot'); };
  const off = e => { e.preventDefault(); node.classList.remove('hot'); };
  node.addEventListener('dragover', on);
  node.addEventListener('dragenter', on);
  node.addEventListener('dragleave', off);
  node.addEventListener('drop', e => {
    off(e);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) onFiles(files);
  });
  return node;
}

/* -------------------------------------------------------------- rendering */
/* `exact` renders at the scale asked for and nothing else. Everything on screen
   wants the extra device-pixel-ratio factor so it is sharp on a retina panel;
   anything measured in dots per inch — OCR, the image exports — must not have
   it, or it silently gets double what it asked for. */
async function renderToCanvas(pageNo, scale, canvas, exact) {
  const p = await S.doc.pdf.getPage(pageNo);
  const dpr = exact ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const vp = p.getViewport({ scale: scale * dpr });
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  await p.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas;
}

function progress(frac) {
  const bar = $('#wb-bar-prog');
  if (frac == null) { bar.hidden = true; bar.firstElementChild.style.width = '0'; return; }
  bar.hidden = false;
  bar.firstElementChild.style.width = clamp(frac, 0, 1) * 100 + '%';
}

/* ------------------------------------------------------------ tool registry */
const TOOLS = [
  { id: 'edit',     name: 'Editor',          icon: 'edit',  blurb: 'Retype a line the document already has, adjust its pictures, or add text, highlights, ink and signatures.' },
  { id: 'organize', name: 'Organize pages',  icon: 'pages', blurb: 'Rotate, delete, duplicate and reorder pages. Extract a selection as a new file.' },
  { id: 'merge',    name: 'Merge',           icon: 'merge', blurb: 'Combine several PDFs and images into one document, in the order you set.' },
  { id: 'split',    name: 'Split',           icon: 'split', blurb: 'Cut a document into separate files by page range, bundled as a zip.' },
  { id: 'toimg',    name: 'PDF → Images',    icon: 'image', blurb: 'Render pages to PNG or JPEG at 72 to 300 DPI.' },
  { id: 'fromimg',  name: 'Images → PDF',    icon: 'topdf', blurb: 'Build a document from JPG, PNG or WebP at A4, Letter or the image’s own size.' },
  { id: 'compress', name: 'Compress',        icon: 'zip',   blurb: 'Re-render pages at lower resolution. Best on scans — often 70–90% smaller.' },
  { id: 'toword',   name: 'PDF → Word',      icon: 'word',  blurb: 'Rebuild the document as an editable .docx, with headings, lists, pictures and colour.' },
  { id: 'ocr',      name: 'Read a scan',     icon: 'scan',  blurb: 'Recognise the words in a scanned page, select and copy them, and save a PDF that any reader can search.' }
];

function buildHome() {
  const grid = $('#tool-grid');
  clear(grid);
  for (const t of TOOLS) {
    grid.append(h('button', { class: 'tool', onclick: () => openTool(t.id) },
      h('span', { class: 'ic' }, ico(t.icon)),
      h('h3', null, t.name),
      h('p', null, t.blurb)
    ));
  }
}

function showHome() {
  S.tool = null;
  $('#view-tool').hidden = true;
  $('#view-home').hidden = false;
  document.body.classList.remove('in-tool');
  document.body.style.overflow = '';
  window.scrollTo({ top: 0 });
}

function openTool(id) {
  S.tool = id;
  $('#view-home').hidden = true;
  $('#view-tool').hidden = false;
  document.body.classList.add('in-tool');
  document.body.style.overflow = 'hidden';
  const t = TOOLS.find(x => x.id === id);
  $('#wb-title').textContent = t.name;
  mount(id);
}

function applySidePanel() {
  const side = $('#wb-side');
  side.hidden = S.sideClosed || !side.dataset.wanted;
}

function wbReset() {
  /* Anything still running under the outgoing tool now fails its ownsScreen()
     check, so it stops instead of painting into the new tool's stage. */
  S.gen++;
  S.keys = null;
  for (const fn of S.cleanup.splice(0)) { try { fn(); } catch (e) {} }
  S.pageEls = [];
  clear($('#wb-stage'));
  const sd = $('#wb-side');
  clear(sd); sd.dataset.wanted = ''; sd.hidden = true;
  clear($('#wb-rail')).hidden = true;
  clear($('#wb-actions'));
  progress(null);
  updateMeta();
}

function updateMeta(extra) {
  const m = $('#wb-meta');
  if (extra) { m.textContent = extra; return; }
  if (!S.doc) { m.textContent = ''; return; }
  m.textContent = `${S.doc.name} · ${S.doc.pages.length} page${S.doc.pages.length > 1 ? 's' : ''} · ${fmtBytes(S.doc.bytes.length)}`;
}

/* Empty state shown by tools that need a document first. */
function needDoc(label, accept, cb) {
  const stage = $('#wb-stage');
  const zone = dropTarget(h('div', { class: 'drop' },
    h('div', { class: 'big' }, label),
    h('div', { class: 'sub' }, 'Drag it onto this panel, or choose it from your machine.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: async () => { const f = await pickFile(accept || '.pdf'); if (f) cb([f]); } }, ico('file'), 'Choose a file'),
      accept ? null : h('button', { class: 'btn', onclick: async () => { await loadSample(); mount(S.tool); } }, 'Use the sample')
    )
  ), cb);
  clear(stage).append(h('div', { class: 'empty' }, h('div', { class: 'inner' }, zone)));
}

/* ------------------------------------------------------------------ mount */
function mount(id) {
  wbReset();
  if (id === 'edit') return mountEditor();
  if (id === 'organize') return mountOrganize();
  if (id === 'merge') return mountMerge();
  if (id === 'split') return mountSplit();
  if (id === 'toimg') return mountToImages();
  if (id === 'fromimg') return mountFromImages();
  if (id === 'compress') return mountCompress();
  if (id === 'toword') return mountToWord();
  if (id === 'ocr') return mountOCR();
}

/* ================================================================= EDITOR */
function mountEditor() {
  if (!S.doc) return needDoc('Open a PDF to edit', null, async files => {
    if (await openPdfFile(files[0])) mountEditor();
  });

  const rail = $('#wb-rail'); rail.hidden = false;
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const acts = $('#wb-actions');

  const DRAW_KIDS = [
    { id: 'ink',     label: 'Pen',     icon: 'pen' },
    { id: 'line',    label: 'Line',    icon: 'line' },
    { id: 'rect',    label: 'Box',     icon: 'rect' },
    { id: 'ellipse', label: 'Circle',  icon: 'circle' },
    { id: 'arrow',   label: 'Arrow',   icon: 'arrow' },
    { id: 'rub',     label: 'Eraser',  icon: 'rub' }
  ];
  const DRAW_IDS = DRAW_KIDS.map(k => k.id);
  const MODES = [
    { id: 'select',   label: 'Select',    icon: 'cursor' },
    { id: 'edittext', label: 'Edit text', icon: 'retype' },
    { id: 'text',   label: 'Add text',   icon: 'type' },
    { id: 'hl',     label: 'Mark',   icon: 'hl' },
    { id: 'draw',   label: 'Draw',   icon: 'pen', kids: DRAW_KIDS },
    { id: 'callout', label: 'Comment', icon: 'callout' },
    { id: 'picture', label: 'Edit image', icon: 'image' },
    { id: 'img',    label: 'Add image', icon: 'plus' },
    { id: 'seal',   label: 'Stamp & sign', icon: 'stamp' }
  ];
  let drawOpen = DRAW_IDS.includes(S.mode);
  for (const m of MODES) {
    if (!m.kids) {
      rail.append(h('button', {
        class: 'trb', 'aria-pressed': S.mode === m.id, 'data-mode': m.id, title: m.label,
        onclick: () => setMode(m.id)
      }, ico(m.icon), h('span', null, m.label)));
      continue;
    }
    // the group header, and under it a drawer that slides open
    const head = h('button', {
      class: 'trb trb-group', 'data-group': m.id, title: m.label,
      'aria-expanded': drawOpen, 'aria-pressed': DRAW_IDS.includes(S.mode),
      onclick: () => {
        if (drawOpen) {
          /* Closing means leaving the group — otherwise syncRail, which keeps
             the drawer open whenever a drawing tool is live, pushes it straight
             back open and the button looks broken. */
          drawOpen = false;
          if (DRAW_IDS.includes(S.mode)) setMode('select');
          else syncRail();
        } else {
          drawOpen = true;
          if (!DRAW_IDS.includes(S.mode)) setMode('ink');
          else syncRail();
        }
      }
    }, ico(m.icon), h('span', null, m.label), h('span', { class: 'chev' }, ico('chev')));
    const drawer = h('div', { class: 'subrail', 'data-drawer': m.id });
    const inner = h('div', { class: 'subrail-in' });
    for (const k of m.kids) {
      inner.append(h('button', {
        class: 'trb trb-sub', 'aria-pressed': S.mode === k.id, 'data-mode': k.id, title: k.label,
        onclick: () => { setMode(k.id); }
      }, ico(k.icon), h('span', null, k.label)));
    }
    drawer.append(inner);
    rail.append(head, drawer);
  }

  /* one place that decides what the rail looks like, so the pressed state and
     the drawer can never drift apart */
  function syncRail() {
    const inGroup = DRAW_IDS.includes(S.mode);
    if (inGroup) drawOpen = true;         // a live drawing tool is always visible
    rail.querySelectorAll('.trb[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === S.mode));
    const head = rail.querySelector('.trb-group');
    if (head) {
      head.setAttribute('aria-pressed', inGroup);
      head.setAttribute('aria-expanded', drawOpen);
    }
    const drawer = rail.querySelector('.subrail');
    if (drawer) {
      drawer.classList.toggle('open', drawOpen);
      /* At phone width the rail runs across and scrolls sideways, so a drawer
         that opens near the right-hand end puts four of its five tools past
         the edge with nothing to say they are there. Bring the far end of it
         into view once the slide has finished. */
      if (drawOpen) {
        setTimeout(() => {
          const last = drawer.querySelector('.trb-sub:last-child');
          if (last && rail.scrollWidth > rail.clientWidth + 4) {
            last.scrollIntoView({ block: 'nearest', inline: 'end', behavior: 'smooth' });
          }
        }, 270);
      }
    }
  }
  syncRail();

  acts.append(
    h('button', { class: 'btn ghost sm', title: 'Undo', onclick: undo }, ico('undo')),
    h('button', { class: 'btn ghost sm', title: 'Redo', onclick: redo }, ico('redo')),
    h('button', { class: 'btn ghost sm', title: 'Zoom out', onclick: () => setZoom(S.zoom / 1.2) }, ico('zoomout')),
    h('button', { class: 'btn ghost sm', title: 'Zoom in', onclick: () => setZoom(S.zoom * 1.2) }, ico('zoomin')),
    h('button', { class: 'btn primary', onclick: exportEdited }, ico('save'), 'Save PDF')
  );

  drawSheet();
  bindStageGestures();
  renderSidePanel();
  fitZoom();

  /* What the keyboard is allowed to do while this tool is the one on screen.
     Anything not listed here simply does not respond, which is why Cmd+Z no
     longer reaches into another tool's action bar and presses whatever happens
     to be first. */
  S.keys = {
    undo, redo,
    remove: () => {
      if (!S.sel) return;
      pushUndo();
      const gone = S.annots.filter(x => x.id === S.sel);
      S.annots = S.annots.filter(x => x.id !== S.sel);
      releaseAnnotURLs(gone);
      S.sel = null;
      repaint(); renderSidePanel();
    }
  };

  const DRAW_MODES = ['ink', 'line', 'rect', 'ellipse', 'arrow', 'callout', 'rub', 'hl', 'text'];
  function setMode(m) {
    S.mode = m;
    // while a drawing tool is up the page must not pan under the pointer
    $('#wb-stage').classList.toggle('drawing', DRAW_MODES.includes(m));
    if (typeof syncRail === 'function') syncRail();
    else rail.querySelectorAll('.trb').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    if (m !== 'select') select(null);
    renderSidePanel();
    /* Only the pages on screen get their layer built. Doing the lot here meant
       choosing Edit text rendered every page of the document in one go; the
       observer picks up the rest as they scroll into view. */
    for (const r of S.pageEls) {
      r.tlayer.hidden = m !== 'edittext';
      r.ilayer.hidden = m !== 'picture';
      if (!nearView(r)) continue;
      if (m === 'edittext') buildTextLayer(r);
      if (m === 'picture') buildImageLayer(r);
    }
    /* Whether an object can be clicked depends on the mode, and that is baked
       into each element when it is drawn. Without a repaint here the objects
       kept the previous mode's setting: after adding a text box and switching
       to Select, every object on the page was still pointer-events:none, so
       nothing could be selected, dragged or re-opened until some other action
       happened to redraw the layer. */
    repaint();
    if (m === 'img') insertImage();
    if (m === 'sign') signatureDialog();
    if (m === 'seal' && !S.ink.length && !S.pendingSig) sealDialog('signature', () => renderSidePanel());
  }

  /* Is this page on screen, or close enough to it to be worth preparing? */
  function nearView(rec) {
    const stage = $('#wb-stage');
    if (!stage || !rec.box.isConnected) return false;
    const a = rec.box.getBoundingClientRect(), b = stage.getBoundingClientRect();
    return a.bottom > b.top - 400 && a.top < b.bottom + 400;
  }

  /* ---- editing the document's own text ---- */
  async function buildTextLayer(rec) {
    if (rec.tbuilding || rec.runs) { paintTextLayer(rec); return; }
    rec.tbuilding = true;
    try {
      // colours and ink heights are read off the rendered page, so it has to
      // exist first — pages below the fold are still lazy at this point
      await ensureRendered(rec, 1.6);
      const page = await S.doc.pdf.getPage(rec.pg.n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      rec.runs = groupBlocks(groupRuns(tc.items, vp, page));
      // settle the substitute face, its size and the line's colours up front, so
      // the in-place editor shows exactly what the commit will produce
      for (const r of rec.runs) {
        r.font = guessStdFont(r.face);
        r.weight = weightClass(r.face);
        r.probe = sampleRun(rec.canvas, rec.pg.w, rec.pg.h, runBox(r));
      }
      applySizeMode();
      paintTextLayer(rec);
      if (rec.pg.n === 1 && !rec.runs.length) {
        toast('No text layer on this page — it is a scan, so there is nothing to edit.', true);
      }
    } catch (e) {
      console.error('text layer failed on page ' + rec.pg.n, e);
      rec.runs = [];
      toast('Could not read the text on page ' + rec.pg.n + '.', true);
    } finally { rec.tbuilding = false; }
  }

  function groupRuns(items, vp, page) {
    const raw = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const m = pdfjsLib.Util.transform(vp.transform, it.transform);
      const size = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
      if (!size || size < 2) continue;
      /* Skip runs that are turned relative to THIS page, rather than every run
         at an angle: on a page the file itself rotates, the viewport has
         already turned the text upright, and a fixed test against zero threw
         the whole page away. */
      const ang = Math.atan2(m[1], m[0]);
      let real = '';
      try { if (page.commonObjs.has(it.fontName)) real = page.commonObjs.get(it.fontName).name || ''; } catch (e) {}
      raw.push({ x: m[4], baseline: m[5], w: it.width || size * it.str.length * 0.5, size, str: it.str, face: real || it.fontName || '', ang });
    }
    {
      const tally = new Map();
      for (const r of raw) {
        const q = Math.round(r.ang / (Math.PI / 2)) * (Math.PI / 2);
        tally.set(q, (tally.get(q) || 0) + r.str.length);
      }
      let base = 0, bestN = -1;
      for (const [q, n] of tally) if (n > bestN) { bestN = n; base = q; }
      const kept = raw.filter(r => Math.abs(r.ang - base) < 0.08);
      raw.length = 0;
      raw.push(...kept);
    }
    raw.sort((a, b) => (a.baseline - b.baseline) || (a.x - b.x));
    const lines = [];
    for (const r of raw) {
      const last = lines[lines.length - 1];
      const gap = last ? r.x - (last.x + last.w) : 0;
      if (last && last.face === r.face
        && Math.abs(last.baseline - r.baseline) < Math.max(1, last.size * 0.3)
        && Math.abs(last.size - r.size) < last.size * 0.3
        && gap > -last.size * 0.8 && gap < last.size * 1.4) {
        const space = gap > last.size * 0.17 && !/\s$/.test(last.str) && !/^\s/.test(r.str);
        last.str += (space ? ' ' : '') + r.str;
        last.w = Math.max(last.w, (r.x + r.w) - last.x);
        // a line can mix sizes; the one covering the most characters wins
        last.weigh.set(r.size, (last.weigh.get(r.size) || 0) + r.str.length);
        last.faces.set(r.face, (last.faces.get(r.face) || 0) + r.str.length);
      } else {
        const line = Object.assign({ id: uid() }, r);
        line.weigh = new Map([[r.size, r.str.length]]);
        line.faces = new Map([[r.face, r.str.length]]);
        lines.push(line);
      }
    }
    for (const l of lines) {
      l.size = [...l.weigh.entries()].sort((a, b) => b[1] - a[1])[0][0];
      l.face = [...l.faces.entries()].sort((a, b) => b[1] - a[1])[0][0];
      l.src = l.str;              // the untouched original, for metric comparison
    }
    return lines.filter(l => l.str.trim().length);
  }

  /* Latin letters mixed with Greek cannot be written by any single standard
     font, so warn before the click rather than mangling it on export. */
  function runRisk(str) {
    const f = toWinAnsi(str);
    return f.changed && /[A-Za-z]/.test(str);
  }

  /* Consecutive lines that share a face, a size, a left edge and a regular
     leading are one editable block — a paragraph, the way a text editor treats
     it, rather than a row at a time. */
  function groupBlocks(lines) {
    const out = [];
    for (const l of lines) {
      const b = out[out.length - 1];
      const gap = b ? l.baseline - b.lastBaseline : 0;
      const faceOk = b && b.face === l.face && Math.abs(b.size - l.size) < b.size * 0.2;
      const leadOk = b && gap > l.size * 0.75 && gap < l.size * 2.4;
      // a first-line indent is still the same paragraph
      const leftOk = b && (Math.abs(l.x - b.x) < Math.max(2, l.size * 0.4) ||
        (b.lines.length === 1 && Math.abs(l.x - b.x) < l.size * 4));
      if (b && faceOk && leadOk && leftOk) {
        b.lines.push(l);
        b.lineH = b.lines.length === 2 ? gap : (b.lineH * (b.lines.length - 2) + gap) / (b.lines.length - 1);
        b.lastBaseline = l.baseline;
        b.right = Math.max(b.right, l.x + l.w);
        b.x = Math.min(b.x, l.x);
      } else {
        out.push({
          id: uid(), face: l.face, size: l.size, x: l.x, right: l.x + l.w,
          baseline: l.baseline, lastBaseline: l.baseline, lineH: l.size * 1.2, lines: [l]
        });
      }
    }
    for (const b of out) {
      // In a wrapped paragraph every line but the last runs to the right edge;
      // those breaks are wrap points, not intentional ones, so the text can flow
      // across them. An address block or a list has ragged line ends — there the
      // breaks are real and must be kept.
      const span = Math.max(1, b.right - b.x);
      const inner = b.lines.slice(0, -1).map(l => (l.x + l.w - b.x) / span);
      b.flow = inner.length > 0 && inner.every(f => f >= 0.82);
      b.str = b.lines.map(l => l.str.replace(/\s+$/, '')).join(b.flow ? ' ' : '\n');
      b.src = b.str;
      b.w = Math.max(12, (b.right - b.x) + Math.max(1.5, b.size * 0.2));
      b.y = b.baseline - b.size * 0.82;
      b.h = (b.lines.length - 1) * b.lineH + b.size * 1.14;
      b.rows = b.rows0 = b.lines.length;
      b.dx = b.dy = 0;
      b.h0 = b.h;
    }
    return out;
  }

  function paintTextLayer(rec) {
    if (!rec.runs) return;
    const z = S.zoom;
    clear(rec.tlayer);
    for (const r of rec.runs) {
      const risky = runRisk(r.str);
      const d = h('div', {
        class: 'trun' + (r.edited ? ' edited' : '') + (risky ? ' risky' : ''),
        title: risky ? 'Contains characters the standard PDF fonts cannot write — editing this will replace them'
                     : (r.rows > 1 ? 'Click to edit this paragraph (' + r.rows + ' lines)' : 'Click to edit this line')
      });
      d.style.cssText = `left:${(r.x + (r.dx || 0) - 1) * z}px;top:${(r.y + (r.dy || 0)) * z}px;` +
        `width:${(r.w + 2) * z}px;height:${r.h * z}px`;
      d.addEventListener('pointerdown', e => { e.stopPropagation(); beginRunEdit(rec, r, d, e); });
      rec.tlayer.append(d);
    }
  }

  function beginRunEdit(rec, r, node, ev) {
    if (node.classList.contains('editing')) return;
    /* Clicking straight from one paragraph to another used to lose the second
       one: the first editor's blur commits, committing repaints the whole text
       layer, and that repaint tore out the node this call was halfway through
       setting up. Close the open editor, wait for the commit it starts, then
       open the paragraph that was clicked — by position, since the node handed
       to us no longer exists by then. */
    const live = rec.tlayer.querySelector('.trun.editing');
    if (live && live !== node) {
      const idx = [...rec.tlayer.children].indexOf(node);
      live.blur();
      Promise.resolve(rec.editDone).then(() => {
        const again = idx >= 0 ? rec.tlayer.children[idx] : null;
        if (again && again.classList.contains('trun')) beginRunEdit(rec, r, again, ev);
      });
      return;
    }
    const z = S.zoom;
    /* Show exactly what the commit will write. The editor used to preview the
       document's own face, size and colour while applyRunEdit committed the
       side panel's overrides, so the typeface, weight, size and colour you
       typed in were not the ones you got. */
    const font = withFmt(r.font || guessStdFont(r.face));
    const size = +(((r.fit != null ? r.fit : r.size)) * (S.fmt.scale || 1)).toFixed(2);
    const fam = fontCss(font), wt = /Bold/.test(font) ? '700' : '400';
    const st = /Italic|Oblique/.test(font) ? 'italic' : 'normal';
    if (!r.probe) r.probe = sampleRun(rec.canvas, rec.pg.w, rec.pg.h, runBox(r));
    const keep = { top: node.style.top, h: node.style.height, w: node.style.width };
    const was = { w: r.w, dx: r.dx || 0, dy: r.dy || 0 };   // moving or re-wrapping counts as an edit too
    node.classList.add('editing');
    node.style.background = r.probe.bg;
    const ink = S.fmt.color || r.probe.fg;
    node.style.color = ink;
    node.style.fontSize = (size * z) + 'px';
    node.style.lineHeight = (r.lineH * z) + 'px';     // the document's own leading
    node.style.fontFamily = fam;
    node.style.fontWeight = wt;
    node.style.fontStyle = st;
    node.style.textShadow = ((S.fmt.weight || r.weight) === 'semi')
      ? (size * z * 0.038).toFixed(2) + 'px 0 0 ' + ink : '';
    node.style.whiteSpace = 'pre-wrap';               // wrap inside the block
    node.style.width = (r.w * z) + 'px';
    node.style.height = 'auto';
    node.style.minHeight = (r.h * z) + 'px';
    node.style.left = ((r.x + (r.dx || 0) - 1) * z) + 'px';
    node.style.top = ((r.baseline + (r.dy || 0) - size * baselineEm(fam, wt, st, r.lineH / size)) * z) + 'px';
    node.dataset.keep = JSON.stringify(keep);
    S.lastRun = r;
    renderSidePanel();
    node.textContent = r.str;
    node.setAttribute('contenteditable', 'true');
    node.focus();

    // put the caret where the click landed, the way a text editor does,
    // instead of selecting the whole block
    let placed = false;
    try {
      if (ev && document.caretRangeFromPoint) {
        const rg = document.caretRangeFromPoint(ev.clientX, ev.clientY);
        if (rg && node.contains(rg.startContainer)) {
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg); placed = true;
        }
      } else if (ev && document.caretPositionFromPoint) {
        const cp = document.caretPositionFromPoint(ev.clientX, ev.clientY);
        if (cp && node.contains(cp.offsetNode)) {
          const rg = document.createRange();
          rg.setStart(cp.offsetNode, cp.offset); rg.collapse(true);
          const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg); placed = true;
        }
      }
    } catch (e) {}
    if (!placed) {
      const rg = document.createRange(); rg.selectNodeContents(node); rg.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg);
    }

    // a bar along the top drags the whole block, words and all
    // same reasoning as the resize handle: these sit inside an editable element
    const mover = h('span', { class: 'movebar', title: 'Drag to move this text', contenteditable: 'false' });
    mover.addEventListener('pointerdown', e => {
      e.stopImmediatePropagation(); e.preventDefault();
      const ox = r.dx || 0, oy = r.dy || 0, sx = e.clientX, sy = e.clientY;
      const move = mv => {
        r.dx = ox + (mv.clientX - sx) / S.zoom;
        r.dy = oy + (mv.clientY - sy) / S.zoom;
        node.style.left = ((r.x + r.dx - 1) * S.zoom) + 'px';
        node.style.top = ((r.baseline + r.dy - size * baselineEm(fam, wt, st, r.lineH / size)) * S.zoom) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('blur', up);
        node.focus();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('blur', up);
    });
    node.append(mover);

    // a handle on the right edge sets where the text wraps
    const grip = h('span', { class: 'wrapgrip', title: 'Drag to set the wrap width', contenteditable: 'false' });
    grip.addEventListener('pointerdown', e => {
      e.stopImmediatePropagation(); e.preventDefault();
      const w0 = r.w, sx = e.clientX;
      const move = mv => {
        r.w = Math.max(size * 3, w0 + (mv.clientX - sx) / S.zoom);
        node.style.width = (r.w * S.zoom) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('blur', up);
        node.focus();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('blur', up);
    });
    node.append(grip);

    let done = false;
    const finish = kept => {
      if (done) return; done = true;
      node.querySelectorAll('.wrapgrip, .movebar').forEach(n => n.remove());
      const next = node.textContent.replace(/\u00a0/g, ' ');
      node.removeAttribute('contenteditable');
      node.classList.remove('editing');
      node.textContent = '';
      node.style.fontSize = node.style.fontFamily = node.style.fontWeight = '';
      node.style.lineHeight = node.style.fontStyle = node.style.whiteSpace = '';
      node.style.background = node.style.color = node.style.minWidth = node.style.minHeight = '';
      node.style.textShadow = '';
      let keptStyle = {};
      try { keptStyle = JSON.parse(node.dataset.keep || '{}'); } catch (e) {}
      node.style.top = keptStyle.top || '';
      node.style.height = keptStyle.h || '';
      node.style.width = keptStyle.w || '';
      const moved = Math.abs((r.dx || 0) - was.dx) > 0.3 || Math.abs((r.dy || 0) - was.dy) > 0.3;
      const rewrapped = Math.abs(r.w - was.w) > 0.5;
      /* Hand the commit back as a promise so that opening another paragraph can
         wait for this one to finish before it starts. */
      if (kept && (next !== r.str || moved || rewrapped))
        rec.editDone = applyRunEdit(rec, r, next).catch(() => toast('That text could not be replaced.', true));
      else { paintTextLayer(rec); rec.editDone = Promise.resolve(); }
    };
    node.addEventListener('blur', () => finish(true), { once: true });
    node.addEventListener('keydown', e2 => {
      e2.stopPropagation();
      if (e2.key === 'Escape') {
        e2.preventDefault();
        r.w = was.w; r.dx = was.dx; r.dy = was.dy;
        finish(false); node.blur();
      }
      // Enter makes a new line inside the block; Cmd/Ctrl+Enter commits
      if (e2.key === 'Enter' && (e2.metaKey || e2.ctrlKey)) { e2.preventDefault(); finish(true); node.blur(); }
    });
  }

  /* Where the page's own images sit. pdf.js replays the drawing operators, so
     tracking the transform stack gives each image's rectangle exactly, rather
     than guessing from the rendered pixels. */
  async function buildImageLayer(rec) {
    if (rec.imgs) { paintImageLayer(rec); return; }
    rec.imgs = [];
    try {
      await ensureRendered(rec, 1.6);
      const page = await S.doc.pdf.getPage(rec.pg.n);
      const vp = page.getViewport({ scale: 1 });
      const ops = await page.getOperatorList();
      const OPS = pdfjsLib.OPS, U = pdfjsLib.Util;
      let ctm = vp.transform.slice();
      const stack = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i], args = ops.argsArray[i];
        if (fn === OPS.save) stack.push(ctm.slice());
        else if (fn === OPS.restore) ctm = stack.pop() || ctm;
        else if (fn === OPS.transform) ctm = U.transform(ctm, args);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageMaskXObject) {
          const c = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => U.applyTransform([x, y], ctm));
          const xs = c.map(q => q[0]), ys = c.map(q => q[1]);
          const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
          if (r.w > 8 && r.h > 8 && r.w < rec.pg.w * 1.5 && r.h < rec.pg.h * 1.5) rec.imgs.push(r);
        }
      }
    } catch (e) { rec.imgs = []; }
    paintImageLayer(rec);
  }

  function paintImageLayer(rec) {
    if (!rec.imgs) return;
    const z = S.zoom;
    clear(rec.ilayer);
    if (!rec.imgs.length) return;
    for (const r of rec.imgs) {
      const d = h('div', { class: 'iroi', title: 'Click to edit this picture' },
        h('span', { class: 'tag' }, Math.round(r.w) + ' × ' + Math.round(r.h) + ' pt'));
      d.style.cssText = `left:${r.x * z}px;top:${r.y * z}px;width:${r.w * z}px;height:${r.h * z}px`;
      d.addEventListener('pointerdown', e => { e.stopPropagation(); grabImage(rec, r); });
      rec.ilayer.append(d);
    }
  }

  /* Lift a page image into an editable object by re-rendering just that region
     at high resolution. The original stays underneath, covered. */
  async function grabImage(rec, rect) {
    const near = S.annots.find(a => a.type === 'img' && a.page === rec.pg.n &&
      Math.abs(a.x - rect.x) < 2 && Math.abs(a.y - rect.y) < 2);
    if (near) { select(near.id); renderSidePanel(); return; }
    progress(0.2);
    try {
      const page = await S.doc.pdf.getPage(rec.pg.n);
      let scale = clamp(1500 / rect.w, 1.5, 6);
      const probe = page.getViewport({ scale });
      if (probe.width * probe.height > 14e6) scale *= Math.sqrt(14e6 / (probe.width * probe.height));
      const vp = page.getViewport({ scale });
      const full = document.createElement('canvas');
      full.width = Math.ceil(vp.width); full.height = Math.ceil(vp.height);
      const fx = full.getContext('2d');
      fx.fillStyle = '#fff'; fx.fillRect(0, 0, full.width, full.height);
      await page.render({ canvasContext: fx, viewport: vp }).promise;
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(rect.w * scale));
      out.height = Math.max(1, Math.round(rect.h * scale));
      out.getContext('2d').drawImage(full, Math.round(rect.x * scale), Math.round(rect.y * scale),
        out.width, out.height, 0, 0, out.width, out.height);
      const blob = await toBlobOrThrow(out, 'image/jpeg', 0.92);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      pushUndo();
      // Patch out the original first. Without this, moving or shrinking the copy
      // leaves the page's own picture showing behind it — two of the same image.
      const pad = Math.max(1, Math.min(rect.w, rect.h) * 0.02);
      const around = sampleRun(rec.canvas, rec.pg.w, rec.pg.h,
        { x: rect.x - pad * 2, y: rect.y - pad * 2, w: rect.w + pad * 4, h: pad * 2 });
      const patch = {
        id: uid(), type: 'cover', page: rec.pg.n, under: true,
        x: rect.x - 0.6, y: rect.y - 0.6, w: rect.w + 1.2, h: rect.h + 1.2,
        color: around.bg || '#ffffff'
      };
      const a = {
        id: uid(), type: 'img', page: rec.pg.n, x: rect.x, y: rect.y, w: rect.w, h: rect.h,
        url: URL.createObjectURL(blob), bytes, fmt: 'jpg', fromPage: true, patch: patch.id,
        filter: { b: 100, c: 100, s: 100, g: 0 }, opacity: 1
      };
      S.annots.push(patch, a);
      setMode('select');            // so it can be dragged and resized at once
      repaint(); select(a.id); renderSidePanel();
      toast('Picture lifted — drag to move, corner handle to resize');
    } catch (e) {
      console.error('grabImage', e);
      toast('That picture could not be read.', true);
    } finally { setTimeout(() => progress(null), 300); }
  }

  /* Rotation and flipping are baked straight into the bitmap: keeping them as a
     CSS transform would make the object's box disagree with what is exported. */
  async function turnImage(a, deg, flipH, flipV) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = a.url; });
    const swap = deg === 90 || deg === 270;
    const cv = document.createElement('canvas');
    cv.width = swap ? img.naturalHeight : img.naturalWidth;
    cv.height = swap ? img.naturalWidth : img.naturalHeight;
    const c = cv.getContext('2d');
    c.translate(cv.width / 2, cv.height / 2);
    if (deg) c.rotate(deg * Math.PI / 180);
    c.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    c.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const blob = await toBlobOrThrow(cv, a.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    pushUndo();
    a.url = URL.createObjectURL(blob);
    a.bytes = new Uint8Array(await blob.arrayBuffer());
    if (swap) { const t = a.w; a.w = a.h; a.h = t; }
    repaint(); renderSidePanel();
  }

  /* Cut the bitmap down to the dragged selection and shrink the object's box to
     match, so the part you kept stays exactly where it was on the page. */
  async function applyCrop(a) {
    const c = a.cropSel;
    if (!c || c.w < 0.02 || c.h < 0.02) { S.cropping = null; repaint(); renderSidePanel(); return; }
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = a.url; });
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * c.w));
      cv.height = Math.max(1, Math.round(img.naturalHeight * c.h));
      cv.getContext('2d').drawImage(img,
        Math.round(img.naturalWidth * c.x), Math.round(img.naturalHeight * c.y),
        cv.width, cv.height, 0, 0, cv.width, cv.height);
      const png = a.fmt === 'png';
      const blob = await toBlobOrThrow(cv, png ? 'image/png' : 'image/jpeg', 0.92);
      pushUndo();
      a.x += a.w * c.x; a.y += a.h * c.y;
      a.w *= c.w; a.h *= c.h;
      a.url = URL.createObjectURL(blob);
      a.bytes = new Uint8Array(await blob.arrayBuffer());
      a.cropSel = null;
      S.cropping = null;
      repaint(); renderSidePanel();
      toast('Cropped');
    } catch (e) { toast('Could not crop that picture.', true); }
  }

  /* Hand the picture to whatever app the person prefers, adjustments baked in,
     then take the edited file back into the same spot. */
  async function sendImageOut(a) {
    try {
      const baked = await bakeImage(Object.assign({}, a, { fmt: 'png' }));
      const n = S.annots.filter(x => x.type === 'img' && x.page === a.page).indexOf(a) + 1;
      const name = 'picture-p' + a.page + (n > 1 ? '-' + n : '') + '.png';
      await offerFile(name, baked.bytes);
      toast('Edit it in any app, then use “Bring the edited file back”');
    } catch (e) { toast('Could not export that picture.', true); }
  }

  async function bringImageBack(a, fitMode) {
    // accept whatever the person's editor produced; the browser decides what it
    // can actually decode, and we say so plainly when it cannot
    const f = await pickFile('image/*');
    if (!f) { toast('No file chosen.'); return; }
    try {
      const im = await loadImageFile(f);
      if (!im || !im.w || !im.h) throw new Error('empty');
      pushUndo();
      a.url = im.url; a.bytes = im.bytes; a.fmt = im.fmt;
      a.filter = { b: 100, c: 100, s: 100, g: 0 };     // the file already carries the edits
      if (fitMode !== 'box') {
        const k = Math.min(a.w / im.w, a.h / im.h);
        a.w = im.w * k; a.h = im.h * k;
      }
      select(a.id); repaint(); renderSidePanel();
      toast(f.name + ' placed — ' + im.w + '×' + im.h + ' px');
    } catch (e) {
      const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
      if (['psd', 'tif', 'tiff', 'heic', 'heif', 'svg', 'bmp', 'ai'].includes(ext))
        toast('A browser cannot read .' + ext + ' files. Save it as PNG or JPEG and try again.', true);
      else toast('“' + f.name + '” could not be read as an image.', true);
    }
  }

  /* Cut the bitmap down to the dragged selection and shrink the object's box to
     match, so the part you kept stays exactly where it was on the page. */
  async function applyCrop(a) {
    const c = a.cropSel;
    if (!c || c.w < 0.02 || c.h < 0.02) { S.cropping = null; repaint(); renderSidePanel(); return; }
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = a.url; });
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * c.w));
      cv.height = Math.max(1, Math.round(img.naturalHeight * c.h));
      cv.getContext('2d').drawImage(img,
        Math.round(img.naturalWidth * c.x), Math.round(img.naturalHeight * c.y),
        cv.width, cv.height, 0, 0, cv.width, cv.height);
      const png = a.fmt === 'png';
      const blob = await toBlobOrThrow(cv, png ? 'image/png' : 'image/jpeg', 0.92);
      pushUndo();
      a.x += a.w * c.x; a.y += a.h * c.y;
      a.w *= c.w; a.h *= c.h;
      a.url = URL.createObjectURL(blob);
      a.bytes = new Uint8Array(await blob.arrayBuffer());
      a.cropSel = null;
      S.cropping = null;
      repaint(); renderSidePanel();
      toast('Cropped');
    } catch (e) { toast('Could not crop that picture.', true); }
  }

  /* Hand the picture to whatever app the person prefers, adjustments baked in,
     then take the edited file back into the same spot. */
  async function sendImageOut(a) {
    try {
      const baked = await bakeImage(Object.assign({}, a, { fmt: 'png' }));
      const n = S.annots.filter(x => x.type === 'img' && x.page === a.page).indexOf(a) + 1;
      const name = 'picture-p' + a.page + (n > 1 ? '-' + n : '') + '.png';
      await offerFile(name, baked.bytes);
      toast('Edit it in any app, then use “Bring the edited file back”');
    } catch (e) { toast('Could not export that picture.', true); }
  }

  async function bringImageBack(a, fitMode) {
    // accept whatever the person's editor produced; the browser decides what it
    // can actually decode, and we say so plainly when it cannot
    const f = await pickFile('image/*');
    if (!f) { toast('No file chosen.'); return; }
    try {
      const im = await loadImageFile(f);
      if (!im || !im.w || !im.h) throw new Error('empty');
      pushUndo();
      a.url = im.url; a.bytes = im.bytes; a.fmt = im.fmt;
      a.filter = { b: 100, c: 100, s: 100, g: 0 };     // the file already carries the edits
      if (fitMode !== 'box') {
        const k = Math.min(a.w / im.w, a.h / im.h);
        a.w = im.w * k; a.h = im.h * k;
      }
      select(a.id); repaint(); renderSidePanel();
      toast(f.name + ' placed — ' + im.w + '×' + im.h + ' px');
    } catch (e) {
      const ext = (f.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
      if (['psd', 'tif', 'tiff', 'heic', 'heif', 'svg', 'bmp', 'ai'].includes(ext))
        toast('A browser cannot read .' + ext + ' files. Save it as PNG or JPEG and try again.', true);
      else toast('“' + f.name + '” could not be read as an image.', true);
    }
  }

  function matchedSize(r) {
    if (S.sizeMode === 'exact') return r.size;
    const k = faceScale(r.face);
    return Math.abs(k - 1) < 0.04 ? r.size : +(r.size * k).toFixed(2);
  }

  function applySizeMode() {
    for (const rec of S.pageEls) {
      if (!rec.runs) continue;
      for (const r of rec.runs) r.fit = matchedSize(r);
    }
  }

  /* Fold the panel's weight/italic overrides into a standard font name. */
  function withFmt(font) {
    const serif = /Times/.test(font), mono = /Courier/.test(font);
    const bold = S.fmt.weight ? S.fmt.weight === 'bold' : /Bold/.test(font);
    const ital = S.fmt.italic == null ? /Italic|Oblique/.test(font) : S.fmt.italic;
    if (serif) return bold && ital ? 'TimesRomanBoldItalic' : bold ? 'TimesRomanBold' : ital ? 'TimesRomanItalic' : 'TimesRoman';
    if (mono) return bold && ital ? 'CourierBoldOblique' : bold ? 'CourierBold' : ital ? 'CourierOblique' : 'Courier';
    return bold && ital ? 'HelveticaBoldOblique' : bold ? 'HelveticaBold' : ital ? 'HelveticaOblique' : 'Helvetica';
  }

  /* The top of whatever sits below this block in the same column. A patch is
     clamped to it, so overflowing text may overlap the next line but can never
     wipe it out. */
  function nextBlockTop(rec, r) {
    let top = rec.pg.h - 1;
    for (const o of rec.runs || []) {
      if (o === r) continue;
      const oTop = o.baseline - o.size * 0.8;
      if (oTop <= (r.lastBaseline != null ? r.lastBaseline : r.baseline) + 0.5) continue;
      const overlap = Math.min(r.x + r.w, o.x + o.w) - Math.max(r.x, o.x);
      if (overlap < Math.min(r.w, o.w) * 0.25) continue;     // a different column
      if (oTop < top) top = oTop;
    }
    return top;
  }

  function runBox(r) {
    const pad = Math.max(1, r.size * 0.14);
    return {
      x: r.x - pad * 0.7,
      y: r.y - pad * 0.4,
      w: r.w + pad * 1.6,
      h: (r.h != null ? r.h : r.size * 1.14) + pad * 0.6
    };
  }

  /* Lay the replacement out at the block's own width and leading, patch the old
     block out, and draw the new one. If it needs more room than the original
     block had, either let it run on (what thebestpdf does) or shrink it to fit. */
  async function applyRunEdit(rec, r, next) {
    const font = withFmt(r.font || guessStdFont(r.face));
    let size = +(((r.fit != null ? r.fit : r.size)) * (S.fmt.scale || 1)).toFixed(2);
    const lead = r.lineH / r.size;                   // the document's own leading, as a ratio
    const probe = r.probe || (r.probe = sampleRun(rec.canvas, rec.pg.w, rec.pg.h, runBox(r)));

    let metrics = null;
    try { metrics = await stdFont(font); } catch (e) {}
    /* Lay the replacement out against the run's width — but never against a
       width too narrow to hold a word. A short run (a page number, a date, one
       word of a heading) is only a few points wide, and wrapping a longer
       replacement into it put ONE CHARACTER on each line; those breaks are then
       baked into the object's text as real newlines, so what landed on the page
       was a column of letters running down it. This is where the vertical text
       came from. */
    const wrapW = sz => Math.max(r.w, minTextWidth({ size: sz }));
    const rowsAt = sz => metrics ? wrapText(next, metrics, sz, wrapW(sz))
                                 : String(next).split('\n');

    let laid = rowsAt(size);
    const fitRows = r.rows0 || r.rows;      // always fit against the block as it began
    if (S.overflow === 'shrink' && laid.length > fitRows) {
      // ease the size down until it fits the space the block already occupied
      for (let i = 0; i < 18 && laid.length > fitRows && size > r.size * 0.68; i++) {
        size = +(size * 0.96).toFixed(2);
        laid = rowsAt(size);
      }
    }
    const rows = laid.length;
    const body = laid.join('\n');

    const grew = Math.max(0, rows - fitRows);
    /* The patch is built from the baseline out, using the real ascender and
       descender, rather than padding a box. Padding overshot by about 0.2 em at
       each edge, which at any decent size is enough to slice the top off the
       line below. */
    const ASC = 0.80, DESC = 0.24;
    const em = Math.max(r.size, size);
    const coverRows = Math.max(fitRows, rows);
    const box = {
      x: r.x - Math.max(0.6, em * 0.06),
      y: r.baseline - em * ASC,
      w: r.w + Math.max(1.2, em * 0.12),
      h: (coverRows - 1) * r.lineH + em * (ASC + DESC)
    };
    const moved = Math.abs(r.dx || 0) > 0.5 || Math.abs(r.dy || 0) > 0.5;
    if (!moved) {
      const ceiling = nextBlockTop(rec, r) - 0.6;
      if (box.y + box.h > ceiling) box.h = Math.max(em * 0.9, ceiling - box.y);
    } else {
      box.h = (fitRows - 1) * r.lineH + em * (ASC + DESC);   // just erase the original
    }               // cover what the new text will occupy

    pushUndo();
    if (r.annotIds) S.annots = S.annots.filter(a => !r.annotIds.includes(a.id));
    const ids = [];
    const cover = { id: uid(), type: 'cover', page: rec.pg.n, x: box.x, y: box.y, w: box.w, h: box.h, color: probe.bg };
    S.annots.push(cover); ids.push(cover.id);
    if (next.trim()) {
      const t = {
        id: uid(), type: 'text', page: rec.pg.n,
        x: r.x + (r.dx || 0), y: r.baseline + (r.dy || 0) - size * 0.82,
        // the box has to be at least as wide as the text was laid out to be
        w: Math.max(r.w + size * 0.6, minTextWidth({ size })), lh: size * lead,
        text: body, size, color: S.fmt.color || probe.fg, font,
        weight: S.fmt.weight || r.weight || 'regular'
      };
      S.annots.push(t); ids.push(t.id);
    }
    r.annotIds = ids;
    r.str = next;
    r.rows = rows;
    r.h = (rows - 1) * r.lineH + r.size * 1.14;
    r.edited = true;
    if (probe.busy) toast('The background behind that text is not a flat colour, so the patch may show.', true);
    if (grew && S.overflow !== 'shrink') toast('That block grew by ' + grew + ' line' + (grew > 1 ? 's' : '') + ' and may now overlap what follows.');
    repaint();
    paintTextLayer(rec);
    renderSidePanel();
  }



  function renderSidePanel() {
    clear(side);
    const a = S.sel ? S.annots.find(x => x.id === S.sel) : null;

    if (a) {
      side.append(h('div', { class: 'pane-h' }, 'Selected ' + ({ text: 'text', hl: 'highlight', ink: 'ink', rect: 'box', ellipse: 'circle', arrow: 'arrow', img: 'image' }[a.type] || 'object')));
      if (a.type === 'text') {
        side.append(field('Font', h('select', {
          onchange: e => { pushUndo(); a.font = e.target.value; repaint(); }
        }, ...['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'Courier', 'CourierBold'].map(f =>
          h('option', { value: f, selected: a.font === f }, f.replace(/([a-z])([A-Z])/g, '$1 $2'))))));
        side.append(sizeRow('Size', a.size, 6, 72, v => {
          /* Grow the box with the type. Setting the size on its own left the
             width where it was, so turning 16pt into 72pt inside a 260pt box
             put one word on each line — and one letter per line for a word
             too long to fit. */
          const pg = S.doc.pages[a.page - 1];
          const k = v / Math.max(1, a.size);
          a.size = v;
          const room = pg ? pg.w - 8 : a.w * k;
          a.w = clamp(a.w * k, minTextWidth(a), Math.max(minTextWidth(a), room));
          if (pg && a.x + a.w > pg.w - 4) a.x = Math.max(4, pg.w - 4 - a.w);
          repaint();
        }));
      }
      if (a.type === 'img') {
        a.filter = a.filter || { b: 100, c: 100, s: 100, g: 0 };
        const box = h('div', { class: 'compact' });
        side.append(box);

        // one row of actions rather than a column of full-width buttons
        box.append(h('div', { class: 'field' },
          h('div', { class: 'seg' },
            h('button', { title: 'Crop', 'aria-pressed': S.cropping === a.id,
              onclick: () => { S.cropping = S.cropping === a.id ? null : a.id; a.cropSel = null; select(a.id); repaint(); renderSidePanel(); } }, ico('rect')),
            h('button', { title: 'Rotate left', onclick: () => turnImage(a, 270, false, false) }, ico('rotl')),
            h('button', { title: 'Rotate right', onclick: () => turnImage(a, 90, false, false) }, ico('rotr')),
            h('button', { title: 'Flip across', onclick: () => turnImage(a, 0, true, false) }, ico('flipH')),
            h('button', { title: 'Flip down', onclick: () => turnImage(a, 0, false, true) }, ico('flipV')))));

        if (S.cropping === a.id) {
          box.append(h('p', { class: 'hint', style: 'margin:-2px 0 6px' },
            a.cropSel ? 'Drag again to re-draw.' : 'Drag across the picture to mark what to keep.'));
          box.append(h('div', { class: 'grid2', style: 'margin-bottom:10px' },
            h('button', { class: 'btn sm primary', style: 'justify-content:center', disabled: !a.cropSel,
              onclick: () => applyCrop(a) }, 'Apply'),
            h('button', { class: 'btn sm', style: 'justify-content:center',
              onclick: () => { a.cropSel = null; S.cropping = null; repaint(); renderSidePanel(); } }, 'Cancel')));
        }

        const num = (label, get, set) => h('div', { class: 'field' },
          h('label', null, label),
          h('input', { type: 'number', step: 1, value: Math.round(get()),
            oninput: e => { const v = parseFloat(e.target.value); if (isFinite(v)) { set(v); repaint(); } } }));
        box.append(h('div', { class: 'grid2' },
          num('Left', () => a.x, v => a.x = v),
          num('Top', () => a.y, v => a.y = v),
          num('Width', () => a.w, v => { if (v > 4) { a.h = a.h * (v / a.w); a.w = v; } }),
          num('Height', () => a.h, v => { if (v > 4) { a.w = a.w * (v / a.h); a.h = v; } })));

        const slider = (label, key, min, max, get, set) => {
          const out = h('span', { class: 'val' }, get() + '%');
          return h('div', { class: 'field' }, h('label', null, label),
            h('div', { class: 'rangerow' },
              h('input', { type: 'range', min, max, value: get(),
                oninput: e => { set(+e.target.value); out.textContent = e.target.value + '%'; repaint(); } }), out));
        };
        const sl = h('div', { class: 'sliders' });
        sl.append(slider('Brightness', 'b', 20, 200, () => a.filter.b, v => a.filter.b = v));
        sl.append(slider('Contrast', 'c', 20, 200, () => a.filter.c, v => a.filter.c = v));
        sl.append(slider('Saturation', 's', 0, 250, () => a.filter.s, v => a.filter.s = v));
        sl.append(slider('Black & white', 'g', 0, 100, () => a.filter.g, v => a.filter.g = v));
        sl.append(slider('Opacity', 'o', 10, 100,
          () => Math.round((a.opacity != null ? a.opacity : 1) * 100), v => a.opacity = v / 100));
        box.append(sl);

        box.append(h('div', { class: 'grid2', style: 'margin-top:4px' },
          h('button', { class: 'btn sm', style: 'justify-content:center', title: 'Save this picture as a PNG to edit elsewhere',
            onclick: () => sendImageOut(a) }, 'Save PNG'),
          h('button', { class: 'btn sm primary', style: 'justify-content:center', title: 'Load the edited file back into this spot',
            onclick: () => bringImageBack(a, 'fit') }, 'Bring back')));
        box.append(h('button', { class: 'linkbtn', onclick: () => bringImageBack(a, 'box') },
          'Bring back, stretched to this box'));
        box.append(h('p', { class: 'hint', style: 'margin:6px 0 10px' },
          'Save the PNG, edit it in any app, then Bring back.'));
        box.append(h('div', { class: 'grid2' },
          h('button', { class: 'btn sm', style: 'justify-content:center',
            onclick: () => { pushUndo(); a.filter = { b: 100, c: 100, s: 100, g: 0 }; a.opacity = 1; repaint(); renderSidePanel(); } }, 'Reset'),
          h('button', { class: 'btn sm danger', style: 'justify-content:center',
            onclick: () => {
              pushUndo();
              S.annots = S.annots.filter(x => x.id !== a.id && x.id !== a.patch);
              select(null); repaint(); renderSidePanel();
            } }, 'Delete')));
        return;
      }
      if (['ink', 'line', 'rect', 'ellipse', 'arrow', 'callout'].includes(a.type)) side.append(sizeRow('Stroke', a.strokeW, 1, 14, v => { a.strokeW = v; repaint(); }));
      if (a.type !== 'img') side.append(colorField(
        a.type === 'hl' ? HL_PALETTE : a.type === 'callout' ? BRIGHT_PALETTE : PALETTE, a.color,
        c => { pushUndo(); a.color = c; if (a.type === 'callout') S.calloutColor = c; repaint(); renderSidePanel(); }));
      side.append(h('button', { class: 'btn danger sm', style: 'width:100%;justify-content:center', onclick: () => { pushUndo(); S.annots = S.annots.filter(x => x.id !== a.id); select(null); repaint(); } }, ico('trash'), 'Delete object'));
      side.append(h('p', { class: 'hint', style: 'font-size:11.5px;color:var(--ink-3);margin-top:12px' }, 'Drag to move. Use the corner handle to resize. Backspace deletes.'));
      return;
    }

    const names = { select: 'Select', edittext: 'Edit text', picture: 'Edit image', text: 'Add text', hl: 'Mark',
      ink: 'Pen', line: 'Line', rect: 'Box', ellipse: 'Circle', arrow: 'Arrow', callout: 'Comment', rub: 'Eraser', img: 'Image',
      sign: 'Sign', seal: 'Stamp & sign' };
    if (S.mode !== 'seal') side.append(h('div', { class: 'pane-h' }, names[S.mode] + ' tool'));
    const tips = {
      select: 'Click an object to move or resize it.',
      edittext: 'Click a paragraph and type. Bar above it moves the block, grip on the right re-wraps it. Ctrl/\u2318+Enter commits, Escape cancels.',
      text:   'Click where the text should start, then type.',
      hl:     'Drag across a line to mark it.',
      ink:    'Draw freehand.',
      rect:   'Drag to draw a box.',
      ellipse:'Drag to draw a circle or an oval.',
      line:   'Drag to draw a straight line. Hold Shift to keep it level or upright.',
      arrow:  'Drag from the tail to the point. Hold Shift to snap to 45\u00b0.',
      callout:'Drag from the thing you want to point at out to where the note should sit, then type.',
      rub:    'Drag over your own marks to rub them out.',
      picture:'Click a picture to lift it out, then move, crop or send it to another app.',
      img:    'Place a PNG, JPEG or WebP, then drag to size it.',
      sign:   'Draw your signature once, place it on any page.',
      seal:   'Keep your signatures and stamps here, and put them on any page.',
      erase:  'Click anything you added to remove it.'
    };
    if (S.mode !== 'seal') side.append(h('p', { style: 'font-size:13px;color:var(--ink-2);margin-bottom:14px' }, tips[S.mode]));

    if (S.mode === 'edittext') {
      const edits = S.annots.filter(a => a.type === 'cover').length;
      side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2);margin-bottom:14px' },
        `${edits} block${edits === 1 ? '' : 's'} replaced \u00b7 build 30`));
      side.append(h('div', { class: 'field' },
        h('label', null, 'Replacement size'),
        h('div', { class: 'seg' },
          h('button', {
            'aria-pressed': S.sizeMode === 'match',
            onclick: () => { S.sizeMode = 'match'; applySizeMode(); renderSidePanel(); toast('Matching the size of the text on the page'); }
          }, 'Match page'),
          h('button', {
            'aria-pressed': S.sizeMode === 'exact',
            onclick: () => { S.sizeMode = 'exact'; applySizeMode(); renderSidePanel(); toast('Using the document\u2019s own point size'); }
          }, 'Exact pt')),
        h('span', { class: 'hint' }, S.sizeMode === 'match'
          ? 'Letters stand as tall as the ones already on the page.'
          : 'Keeps the point size recorded in the file.')));
      // --- formatting of the replacement ---
      const r0 = S.lastRun;
      const detFont = r0 ? (r0.font || guessStdFont(r0.face)) : 'Helvetica';
      const detItal = /Italic|Oblique/.test(detFont);
      const wNow = S.fmt.weight || (r0 && r0.weight) || (/Bold/.test(detFont) ? 'bold' : 'regular');
      const itNow = S.fmt.italic == null ? detItal : S.fmt.italic;
      const colNow = S.fmt.color || (r0 && r0.probe ? r0.probe.fg : '#141922');

      side.append(h('div', { class: 'pane-h', style: 'margin-top:16px' }, 'Replacement format'));
      if (r0) side.append(h('p', { class: 'mono', style: 'font-size:11.5px;color:var(--ink-3);margin-bottom:8px' },
        `detected: ${(r0.face || '?').replace(/^[A-Z]{6}\+/, '')} ${(+(r0.fit || r0.size)).toFixed(1)}pt`));
      side.append(h('div', { class: 'field' },
        h('div', { class: 'seg' },
          ...[['Reg', 'regular', '400'], ['Semi', 'semi', '600'], ['Bold', 'bold', '700']].map(([lab, v, fw]) =>
            h('button', {
              'aria-pressed': wNow === v, style: 'font-weight:' + fw,
              onclick: () => { S.fmt.weight = v; renderSidePanel(); }
            }, lab)),
          h('button', {
            'aria-pressed': itNow, style: 'font-style:italic',
            onclick: () => { S.fmt.italic = !itNow; renderSidePanel(); }
          }, 'I'),
          h('button', {
            onclick: () => { S.fmt.scale = +(Math.max(0.5, (S.fmt.scale || 1) - 0.08)).toFixed(2); renderSidePanel(); }
          }, 'A\u2212'),
          h('button', {
            onclick: () => { S.fmt.scale = +(Math.min(2.2, (S.fmt.scale || 1) + 0.08)).toFixed(2); renderSidePanel(); }
          }, 'A+'))));
      const swatches = h('div', { class: 'swatches' });
      for (const c of [colNow, '#000000', '#e00000', '#1a4dbf', '#17795a', '#737a85', '#ffffff']) {
        if (!c) continue;
        swatches.append(h('button', {
          class: 'sw', style: 'background:' + c, title: c, 'aria-pressed': (S.fmt.color || colNow) === c,
          onclick: () => { S.fmt.color = c; renderSidePanel(); }
        }));
      }
      side.append(h('div', { class: 'field' }, h('label', null, 'Colour'), swatches));
      const touched = S.fmt.weight || S.fmt.italic != null || S.fmt.color || (S.fmt.scale || 1) !== 1;
      side.append(h('p', { class: 'hint', style: 'margin-top:-6px' }, touched
        ? `Overriding: ${wNow}${itNow ? ' italic' : ''}, ${Math.round((S.fmt.scale || 1) * 100)}% size.`
        : 'Following the document.'));
      if (touched) side.append(h('button', {
        class: 'btn sm', style: 'width:100%;justify-content:center;margin-bottom:14px',
        onclick: () => { S.fmt = { weight: null, italic: null, color: null, scale: 1 }; renderSidePanel(); }
      }, 'Follow the document again'));

      side.append(h('div', { class: 'field' },
        h('label', null, 'If the text outgrows its block'),
        h('div', { class: 'seg' },
          h('button', { 'aria-pressed': S.overflow === 'wrap',
            onclick: () => { S.overflow = 'wrap'; renderSidePanel(); } }, 'Let it run on'),
          h('button', { 'aria-pressed': S.overflow === 'shrink',
            onclick: () => { S.overflow = 'shrink'; renderSidePanel(); } }, 'Shrink to fit')),
        h('span', { class: 'hint' }, S.overflow === 'shrink'
          ? 'Size eases down, never below 68%, so the block keeps its room.'
          : 'Extra lines run past the block. They may overlap what follows, never erase it.')));
      side.append(h('details', { style: 'margin-top:16px;font-size:12px;color:var(--ink-2)' },
        h('summary', { style: 'cursor:pointer;color:var(--ink-3)' }, 'How this works'),
        h('p', { style: 'margin-top:8px' },
          'The old paragraph is covered with the paper colour sampled from the page and your text is redrawn on the same baseline, in the closest standard font scaled to match the original\u2019s x-height.'),
        h('p', { style: 'margin-top:8px;color:var(--mark)' },
          'It does not reflow, and this is not redaction \u2014 the old words remain in the file. Run the saved file through Compress to remove them for good.')));
    }

    if (S.mode === 'text') {
      side.append(field('Font', h('select', { onchange: e => S.fontName = e.target.value },
        ...['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'Courier', 'CourierBold'].map(f =>
          h('option', { value: f, selected: S.fontName === f }, f.replace(/([a-z])([A-Z])/g, '$1 $2'))))));
      side.append(sizeRow('Size', S.fontSize, 6, 72, v => S.fontSize = v));
      side.append(colorField(PALETTE, S.color, c => { S.color = c; renderSidePanel(); }));
    }
    if (S.mode === 'hl') side.append(colorField(HL_PALETTE, HL_PALETTE.includes(S.color) ? S.color : HL_PALETTE[0], c => { S.color = c; renderSidePanel(); }));
    if (S.mode === 'callout') {
      side.append(sizeRow('Size', S.fontSize, 6, 72, v => S.fontSize = v));
      side.append(sizeRow('Stroke', S.strokeW, 1, 14, v => S.strokeW = v));
      side.append(colorField(BRIGHT_PALETTE, S.calloutColor, c => { S.calloutColor = c; renderSidePanel(); }));
    } else if (['ink', 'line', 'rect', 'ellipse', 'arrow'].includes(S.mode)) {
      side.append(sizeRow('Stroke', S.strokeW, 1, 14, v => S.strokeW = v));
      side.append(colorField(PALETTE, S.color, c => { S.color = c; renderSidePanel(); }));
    }
    if (S.penSeen && ['ink', 'rect', 'ellipse', 'arrow', 'rub', 'hl'].includes(S.mode)) {
      side.append(h('div', { class: 'field' },
        h('label', { for: 'pen-only', style: 'display:flex;align-items:center;gap:8px;cursor:pointer' },
          h('input', { type: 'checkbox', id: 'pen-only', checked: S.penOnly,
            onchange: e => { S.penOnly = e.target.checked; renderSidePanel(); } }),
          'Pencil only'),
        h('span', { class: 'hint' }, S.penOnly
          ? 'A finger or a resting palm scrolls the page instead of drawing.'
          : 'A finger draws too.')));
    }
    if (S.mode === 'seal') {
      side.append(h('div', { class: 'pane-h' }, 'Stamp & sign'));
      side.append(h('p', { class: 'hint' },
        'Photograph a signature or a rubber stamp on white paper. The paper is removed and the ink kept, with its own colour and no white box around it.'));
      const strip = h('div', { class: 'inkrow' });
      if (!(S.ink || []).length) {
        strip.append(h('p', { class: 'hint', style: 'margin:4px 0' }, 'Nothing saved yet.'));
      } else {
        for (const a of S.ink) {
          strip.append(h('div', { class: 'inkitem' },
            h('button', {
              class: 'inkcard checker', title: 'Place ' + a.name,
              onclick: () => placeSaved(a)
            }, h('img', { src: a.data, alt: a.name })),
            h('span', { class: 'inkname', title: a.name }, a.name),
            h('button', {
              class: 'inkdel', title: 'Delete ' + a.name, 'aria-label': 'Delete ' + a.name,
              onclick: () => removeInk(a)
            }, ico('trash'))));
        }
      }
      side.append(strip);
      side.append(h('div', { class: 'grid2', style: 'margin-top:10px' },
        h('button', { class: 'btn sm', onclick: () => sealDialog('signature', () => renderSidePanel()) }, ico('scan'), 'From a photo'),
        h('button', { class: 'btn sm', onclick: () => signatureDialog() }, ico('sign'), 'Draw')));
      side.append(h('p', { class: 'hint', style: 'margin-top:10px' },
        S.inkVolatile
          ? 'This browser will not keep saved ink, so the library lasts for this session only.'
          : 'Saved in this browser only \u2014 never uploaded.'));
    }

    if (S.mode === 'rub') {
      side.append(sizeRow('Rubber', S.rubberW, 4, 48, v => { S.rubberW = v; renderSidePanel(); }));
      side.append(h('p', { class: 'hint' },
        'Pen strokes are cut exactly where you rub. A shape, a text box or a picture becomes a picture once part of it is rubbed out, so it keeps only the pixels left behind.'));
      side.append(h('p', { class: 'hint', style: 'color:var(--mark);margin-top:8px' },
        'It only takes away things you added. To hide something the document itself prints, draw a white Box over it.'));
    }

    const count = S.annots.length;
    side.append(h('div', { class: 'pane-h', style: 'margin-top:20px' }, 'Document'));
    side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2)' },
      `${S.doc.pages.length} pages · ${count} object${count === 1 ? '' : 's'} added`));
    if (count) side.append(h('button', { class: 'btn sm', style: 'width:100%;justify-content:center;margin-top:10px', onclick: () => { pushUndo(); S.annots = []; select(null); repaint(); renderSidePanel(); } }, 'Clear all objects'));
  }

  function field(label, control) {
    return h('div', { class: 'field' }, h('label', null, label), control);
  }
  function sizeRow(label, value, min, max, cb) {
    const out = h('span', { class: 'val' }, value + ' pt');
    return h('div', { class: 'field' }, h('label', null, label),
      h('div', { class: 'rangerow' },
        h('input', { type: 'range', min, max, step: 1, value, oninput: e => { const v = +e.target.value; out.textContent = v + ' pt'; cb(v); } }),
        out));
  }
  function colorField(pal, current, cb) {
    const wrap = h('div', { class: 'swatches' });
    for (const c of pal) {
      wrap.append(h('button', {
        class: 'sw', style: 'background:' + c, title: c, 'aria-pressed': c === current,
        onclick: () => cb(c)
      }));
    }
    return h('div', { class: 'field' }, h('label', null, 'Colour'), wrap);
  }

  /* ---- sheet + annotation layers ---- */
  function drawSheet() {
    const stage = $('#wb-stage');
    clear(stage);
    const sheet = h('div', { class: 'sheet' });
    S.pageEls = [];
    for (const pg of S.doc.pages) {
      const box = h('div', { class: 'page', 'data-page': pg.n });
      const canvas = h('canvas');
      const layer = h('div', { class: 'layer' });
      const tlayer = h('div', { class: 'tlayer', hidden: true });
      const ilayer = h('div', { class: 'tlayer ilayer', hidden: true });
      box.append(canvas, layer, tlayer, ilayer, h('span', { class: 'pgnum' }, 'Page ' + pg.n + ' / ' + S.doc.pages.length));
      sheet.append(box);
      S.pageEls.push({ pg, box, canvas, layer, tlayer, ilayer, renderTask: null, painted: false, runs: null, imgs: null });
      bindLayer(layer, pg);
    }
    stage.append(sheet);
    applyZoom();
    observeRender();
    /* The stage element itself survives a re-mount — only its children are
       cleared — so a listener left on it here was still live the next time the
       editor was opened, and a session that moved between tools a few times had
       the same handler running several times over. */
    const clearSel = e => {
      /* Only the Select tool cares about clearing the selection, and it is the
         one place where a repaint here is harmless. With a drawing tool up this
         fired on every stroke, repainting the layer out from under the live
         preview — which is why the rubber stopped showing where it was. */
      if (S.mode !== 'select') return;
      if (!e.target.closest('.an') && !e.target.closest('.handle')) select(null);
    };
    stage.addEventListener('pointerdown', clearSel);
    onCleanup(() => stage.removeEventListener('pointerdown', clearSel));
  }

  /* On a tablet the page still has to be navigable while a pen tool is live, so
     the stage takes the gestures the browser can no longer handle for us: two
     fingers pan and pinch, and — when the pencil owns the drawing — one finger
     pans too. A second finger landing mid-stroke means the stroke was never
     meant to be one, so it is rolled back. */
  function bindStageGestures() {
    const stage = $('#wb-stage');
    const live = new Map();
    let gesture = null, frame = null;

    const apply = () => {
      frame = null;
      if (!gesture) return;
      const ps = [...live.values()];
      if (!ps.length) return;
      if (gesture.single) {
        stage.scrollLeft = gesture.sl - (ps[0].x - gesture.x0);
        stage.scrollTop = gesture.st - (ps[0].y - gesture.y0);
        return;
      }
      if (ps.length < 2) return;
      const mx = (ps[0].x + ps[1].x) / 2, my = (ps[0].y + ps[1].y) / 2;
      const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (gesture.d0 > 24) {
        const want = clamp(gesture.z0 * (d / gesture.d0), 0.25, 4);
        if (Math.abs(want - S.zoom) > 0.01) setZoom(want);
      }
      stage.scrollLeft = gesture.sl - (mx - gesture.mx0);
      stage.scrollTop = gesture.st - (my - gesture.my0);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };

    const onDown = e => {
      if (e.pointerType !== 'touch') return;
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });
      S.touches = live.size;
      if (live.size === 2) {
        if (S.cancelStroke) S.cancelStroke();        // that first finger was not a stroke
        const ps = [...live.values()];
        gesture = {
          mx0: (ps[0].x + ps[1].x) / 2, my0: (ps[0].y + ps[1].y) / 2,
          d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y),
          sl: stage.scrollLeft, st: stage.scrollTop, z0: S.zoom
        };
      } else if (live.size === 1 && DRAW_MODES.includes(S.mode) && S.penSeen && S.penOnly) {
        // the pencil draws, so a finger is for getting around
        gesture = { single: true, x0: e.clientX, y0: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop };
      }
    };

    const onMove = e => {
      if (e.pointerType !== 'touch') return;
      const p = live.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (gesture) { if (e.cancelable) e.preventDefault(); schedule(); }
    };

    const drop = e => {
      if (e.pointerType !== 'touch') return;
      live.delete(e.pointerId);
      S.touches = live.size;
      if (live.size === 0) gesture = null;
      else if (gesture && !gesture.single && live.size === 1) {
        const ps = [...live.values()];
        gesture = { single: true, x0: ps[0].x, y0: ps[0].y, sl: stage.scrollLeft, st: stage.scrollTop };
      }
    };
    stage.addEventListener('pointerdown', onDown, true);
    stage.addEventListener('pointermove', onMove, true);
    stage.addEventListener('pointerup', drop, true);
    stage.addEventListener('pointercancel', drop, true);
    onCleanup(() => {
      stage.removeEventListener('pointerdown', onDown, true);
      stage.removeEventListener('pointermove', onMove, true);
      stage.removeEventListener('pointerup', drop, true);
      stage.removeEventListener('pointercancel', drop, true);
      if (frame) cancelAnimationFrame(frame);
      live.clear();
      S.touches = 0;
    });
  }

  /* Make sure this page's canvas actually holds the page.

     `rec.rendered` only ever meant "a render was started", and a fresh canvas
     is 300×150, not 0 — so the old `!rec.canvas.width` guard never fired and
     the colour sampler happily read the blank default. Both the flag and the
     promise are kept here, so a caller can wait for a render someone else
     began rather than starting a second one over the top. */
  function ensureRendered(rec, minScale) {
    if (rec.painted) return rec.renderTask || Promise.resolve();
    if (!rec.renderTask) {
      rec.renderTask = renderToCanvas(rec.pg.n, Math.max(minScale || 1.2, S.zoom), rec.canvas)
        .then(c => { rec.painted = true; return c; })
        .catch(e => { rec.renderTask = null; throw e; });
    }
    return rec.renderTask;
  }

  function observeRender() {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const rec = S.pageEls.find(r => r.box === en.target);
        if (!rec) continue;
        ensureRendered(rec, 1.2).catch(() => {});
        /* A page that scrolls into view while Edit text or Edit image is up
           needs its layer built now. Building all of them the moment the mode
           was chosen rendered the whole document at once, which on anything
           long locked the tab for several seconds. */
        if (S.mode === 'edittext') buildTextLayer(rec);
        else if (S.mode === 'picture') buildImageLayer(rec);
      }
    }, { root: $('#wb-stage'), rootMargin: '400px' });
    S.pageEls.forEach(r => io.observe(r.box));
    onCleanup(() => io.disconnect());
  }

  function applyZoom() {
    for (const r of S.pageEls) {
      r.box.style.width = (r.pg.w * S.zoom) + 'px';
      r.box.style.height = (r.pg.h * S.zoom) + 'px';
      if (r.runs) paintTextLayer(r);
      if (r.imgs) paintImageLayer(r);
    }
    repaint();
  }
  function setZoom(z) { S.zoom = clamp(z, 0.25, 4); applyZoom(); }
  function fitZoom() {
    const avail = $('#wb-stage').clientWidth - 48;
    const w = S.doc.pages[0].w;
    setZoom(clamp(avail / w, 0.3, 1.8));
  }

  function repaint() {
    for (const r of S.pageEls) {
      // keep whatever is mid-gesture; only the committed objects are rebuilt
      const live = [...r.layer.querySelectorAll('.liveink, .rubring')];
      clear(r.layer);
      for (const a of S.annots.filter(x => x.page === r.pg.n)) r.layer.append(annotEl(a));
      for (const el of live) r.layer.append(el);
    }
  }

  function annotEl(a) {
    const z = S.zoom;
    const base = { class: 'an' + (S.sel === a.id ? ' sel' : ''), 'data-id': a.id };
    let n;
    if (a.type === 'text') {
      // repair the box before it is measured, not after it has drawn wrongly
      const pg = S.doc && S.doc.pages[a.page - 1];
      fixTextBox(a, pg ? pg.w : null);
      n = h('div', Object.assign(base, { class: base.class + ' an-text' }));
      const fam = fontCss(a.font);
      const wt = /Bold/.test(a.font) ? 700 : 400;
      const st = /Italic|Oblique/.test(a.font) ? 'italic' : 'normal';
      // place the element so its FIRST BASELINE lands where the PDF will draw it
      const top = a.y + a.size * 0.82 - a.size * baselineEm(fam, wt, st, (a.lh || a.size * 1.22) / a.size);
      n.style.cssText = `left:${a.x * z}px;top:${top * z}px;width:${a.w * z}px;color:${a.color};` +
        `font-size:${a.size * z}px;font-family:${fam};font-weight:${wt};font-style:${st};` +
        `line-height:${(a.lh || a.size * 1.22) * z}px;white-space:pre-wrap` +
        (a.weight === 'semi' ? `;text-shadow:${(a.size * z * 0.038).toFixed(2)}px 0 0 ${a.color}` : '');
      n.textContent = a.text;
    } else if (a.type === 'hl') {
      n = h('div', Object.assign(base, { class: base.class + ' an-hl' }));
      n.style.cssText = `left:${a.x * z}px;top:${a.y * z}px;width:${a.w * z}px;height:${a.h * z}px;background:${a.color};opacity:.55`;
    } else if (a.type === 'rect') {
      n = h('div', base);
      n.style.cssText = `left:${a.x * z}px;top:${a.y * z}px;width:${a.w * z}px;height:${a.h * z}px;` +
        `border:${Math.max(1, a.strokeW * z)}px solid ${a.color};border-radius:2px`;
    } else if (a.type === 'ellipse') {
      n = h('div', base);
      n.style.cssText = `left:${a.x * z}px;top:${a.y * z}px;width:${a.w * z}px;height:${a.h * z}px;` +
        `border:${Math.max(1, a.strokeW * z)}px solid ${a.color};border-radius:50%`;
    } else if (a.type === 'arrow' || a.type === 'line' || a.type === 'erase') {
      const b = shapeBox(a);
      const pad = (a.type === 'erase' ? a.strokeW : Math.max(a.strokeW * 3, 10)) + 4;
      n = h('div', base);
      n.style.cssText = `left:${(b.x - pad) * z}px;top:${(b.y - pad) * z}px;` +
        `width:${(b.w + pad * 2) * z}px;height:${(b.h + pad * 2) * z}px;` +
        (a.type === 'erase' ? 'pointer-events:none' : '');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
      svg.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      if (a.type === 'erase') {
        path.setAttribute('d', a.pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join(' '));
        path.setAttribute('stroke', 'var(--mark)');
        path.setAttribute('stroke-opacity', '0.35');
      } else if (a.type === 'line') {
        path.setAttribute('d', `M${a.x} ${a.y} L${a.x + a.w} ${a.y + a.h}`);
        path.setAttribute('stroke', a.color);
      } else {
        const hd = arrowHead(a);
        path.setAttribute('d',
          `M${a.x} ${a.y} L${a.x + a.w} ${a.y + a.h} ` +
          `M${hd.l[0].toFixed(2)} ${hd.l[1].toFixed(2)} L${a.x + a.w} ${a.y + a.h} L${hd.r[0].toFixed(2)} ${hd.r[1].toFixed(2)}`);
        path.setAttribute('stroke', a.color);
      }
      path.setAttribute('stroke-width', a.strokeW);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      n.append(svg);
    } else if (a.type === 'cover') {
      n = h('div', base);
      n.style.cssText = `left:${a.x * z}px;top:${a.y * z}px;width:${a.w * z}px;height:${a.h * z}px;background:${a.color}`;
    } else if (a.type === 'callout') {
      const g = calloutGeom(a);
      const pad = Math.max(a.strokeW * 3, 10) + 4;
      n = h('div', Object.assign(base, { class: base.class + ' an-callout' }));
      n.style.cssText = `left:${(g.box.x - pad) * z}px;top:${(g.box.y - pad) * z}px;` +
        `width:${(g.box.w + pad * 2) * z}px;height:${(g.box.h + pad * 2) * z}px`;
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
      svg.setAttribute('viewBox', `${g.box.x - pad} ${g.box.y - pad} ${g.box.w + pad * 2} ${g.box.h + pad * 2}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible';
      const stem = { x: g.from.x, y: g.from.y, w: g.tip.x - g.from.x, h: g.tip.y - g.from.y, strokeW: a.strokeW };
      const hd = arrowHead(stem);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d',
        `M${g.from.x.toFixed(2)} ${g.from.y.toFixed(2)} L${g.tip.x.toFixed(2)} ${g.tip.y.toFixed(2)} ` +
        `M${hd.l[0].toFixed(2)} ${hd.l[1].toFixed(2)} L${g.tip.x.toFixed(2)} ${g.tip.y.toFixed(2)} L${hd.r[0].toFixed(2)} ${hd.r[1].toFixed(2)}`);
      path.setAttribute('stroke', a.color);
      path.setAttribute('stroke-width', g.bw);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.append(path);
      const fam = fontCss(a.font);
      const lab = h('div', { class: 'cl-label' });
      lab.style.cssText =
        `left:${(g.label.x - (g.box.x - pad)) * z}px;top:${(g.label.y - (g.box.y - pad)) * z}px;` +
        `width:${g.inner * z}px;padding:${g.pad * z}px;border:${g.bw * z}px solid ${a.color};` +
        `color:${a.color};font-family:${fam};font-size:${a.size * z}px;line-height:${g.lh * z}px`;
      lab.textContent = a.text || '';
      n.append(svg, lab);
      /* a second grip, on the point itself, so a note can be re-aimed without
         being redrawn */
      if (S.sel === a.id) {
        const tipGrip = h('span', { class: 'cl-tip', title: 'Drag to move the point', contenteditable: 'false' });
        tipGrip.style.cssText = `left:${(g.tip.x - (g.box.x - pad)) * z}px;top:${(g.tip.y - (g.box.y - pad)) * z}px`;
        tipGrip.addEventListener('pointerdown', e => {
          e.stopPropagation(); e.preventDefault();
          const ox = a.x, oy = a.y;
          pushUndo();
          dragLoop(e, (dx, dy) => { a.x = ox + dx / S.zoom; a.y = oy + dy / S.zoom; repaint(); });
        });
        n.append(tipGrip);
      }
    } else if (a.type === 'img' && S.cropping === a.id) {
      n = h('div', Object.assign(base, { class: base.class + ' an-crop' }));
      n.style.cssText = `left:${a.x * z}px;top:${a.y * z}px;width:${a.w * z}px;height:${a.h * z}px;` +
        `background-image:url(${a.url});background-size:100% 100%;cursor:crosshair`;
      const sel = h('div', { class: 'cropsel' });
      const place = r => {
        sel.hidden = !r;
        if (r) sel.style.cssText = `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
      };
      place(a.cropSel);
      n.append(sel, h('span', { class: 'crophint' }, a.cropSel ? 'Apply or cancel on the right' : 'Drag the part to keep'));
      n.addEventListener('pointerdown', e => {
        e.stopImmediatePropagation(); e.preventDefault();
        const box = n.getBoundingClientRect();
        const sx = (e.clientX - box.left) / box.width, sy = (e.clientY - box.top) / box.height;
        const move = ev => {
          const cx = clamp((ev.clientX - box.left) / box.width, 0, 1);
          const cy = clamp((ev.clientY - box.top) / box.height, 0, 1);
          a.cropSel = { x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) };
          place(a.cropSel);
        };
        /* pointercancel was not listened for, so a crop drag the system took
           away — a scroll claiming the gesture on a tablet, or a release
           outside the window — left the move handler on the window for good,
           and the next drag anywhere redrew this crop box. */
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          window.removeEventListener('blur', up);
          if (a.cropSel && (a.cropSel.w < 0.02 || a.cropSel.h < 0.02)) a.cropSel = null;
          renderSidePanel(); repaint();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        window.addEventListener('blur', up);
      });
    } else if (a.type === 'img') {
      n = h('div', Object.assign(base, { class: base.class + ' an-img' }));
      n.style.cssText = `left:${a.x * z}px;top:${a.y * z}px;width:${a.w * z}px;height:${a.h * z}px;` +
        `background-image:url(${a.url});background-size:100% 100%;background-repeat:no-repeat` +
        (a.filter ? `;filter:${cssFilter(a.filter)}` : '') +
        (a.opacity != null && a.opacity < 1 ? `;opacity:${a.opacity}` : '');
    } else { // ink
      const minX = Math.min(...a.pts.map(p => p[0])), minY = Math.min(...a.pts.map(p => p[1]));
      const maxX = Math.max(...a.pts.map(p => p[0])), maxY = Math.max(...a.pts.map(p => p[1]));
      n = h('div', base);
      n.style.cssText = `left:${minX * z}px;top:${minY * z}px;width:${(maxX - minX) * z}px;height:${(maxY - minY) * z}px`;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
      svg.setAttribute('viewBox', `0 0 ${Math.max(1, maxX - minX)} ${Math.max(1, maxY - minY)}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      for (const run of inkRuns(a)) {
        const pl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pl.setAttribute('d', inkPathData(run.pts, minX, minY));
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', a.color);
        pl.setAttribute('stroke-width', run.w);
        pl.setAttribute('stroke-linecap', 'round');
        pl.setAttribute('stroke-linejoin', 'round');
        svg.append(pl);
      }
      n.append(svg);
    }
    /* An object is only grabbable with the Select tool. Otherwise a pen stroke
       or a rubbing that happens to start on top of one would drag it instead of
       drawing, which is exactly what it looked like it was doing. */
    const grabbable = S.mode === 'select' || S.cropping === a.id || (S.mode === 'picture' && a.type === 'img');
    if (!grabbable) n.style.pointerEvents = 'none';
    if (S.cropping !== a.id && !a.under) n.addEventListener('pointerdown', e => onAnnotDown(e, a, n));
    if (S.sel === a.id && a.type !== 'ink') {
      /* The handle is a CHILD of the object it resizes, and for a text box
         that object becomes contenteditable. With the box still empty the
         handle is its only child, so the caret lands INSIDE it and every
         character typed goes into a 13px box pinned to the bottom-right
         corner — which is why the text ran vertically down the edge while it
         was being typed, then snapped onto one line the moment the box was
         committed and textContent read the lot back. contenteditable="false"
         keeps the caret out of it; editText takes it away altogether. */
      const hd = h('span', { class: 'handle', contenteditable: 'false' });
      hd.addEventListener('pointerdown', e => onResize(e, a));
      n.append(hd);
    }
    return n;
  }


  function ptFromEvent(e, layer) {
    const r = layer.getBoundingClientRect();
    return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom };
  }

  /* A rubber you cannot see is a rubber you cannot aim. The ring follows the
     pointer at the size the rubbing will actually have — the only feedback
     there is on a tablet, where there is no cursor at all. */
  function rubberRing(layer) {
    let ring = layer.querySelector('.rubring');
    if (!ring) {
      ring = h('div', { class: 'rubring' });
      layer.append(ring);
    }
    return {
      at(x, y) {
        const d = S.rubberW * S.zoom;
        ring.style.cssText = `width:${d}px;height:${d}px;left:${x * S.zoom}px;top:${y * S.zoom}px`;
        ring.classList.add('on');
      },
      off() { ring.classList.remove('on'); }
    };
  }

  function bindLayer(layer, pg) {
    /* while the rubber is the live tool, track the pointer even before it is
       pressed, so a mouse user sees the size too */
    layer.addEventListener('pointermove', e => {
      if (S.mode !== 'rub') return;
      if (e.buttons) return;                       // a stroke in progress draws its own
      const q = ptFromEvent(e, layer);
      rubberRing(layer).at(q.x, q.y);
    });
    layer.addEventListener('pointerleave', () => {
      const ring = layer.querySelector('.rubring');
      if (ring) ring.classList.remove('on');
    });
    layer.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.pointerType === 'pen' && !S.penSeen) { S.penSeen = true; renderSidePanel(); }
      /* The stage counts fingers before this runs. A second one means the
         gesture is a pan or a pinch, not a line. */
      if (e.pointerType === 'touch' && S.touches > 1) return;
      /* Once a stylus has been used, a touch is a palm or a scroll — never a
         line. Let the browser have it. */
      if (isPalm(e) && S.mode !== 'select') return;
      if (e.target.closest('.an')) return;          // handled by the object
      const p = ptFromEvent(e, layer);
      if (S.mode === 'text') {
        /* Without this the browser's own mousedown handling moves focus to the
           layer right after we focus the new box, which blurs it and ends the
           edit before a single key arrives. */
        e.preventDefault();
        /* Clicking a box that is already there means "edit this one", not "put
           a new one on top of it". In Add text mode the objects are
           click-through, so the press lands on the layer and nothing else
           would ever catch it — which is why text, once placed, could not be
           changed without first finding the Select tool. */
        const hit = S.annots.slice().reverse().find(x =>
          x.type === 'text' && x.page === pg.n &&
          p.x >= x.x - 2 && p.x <= x.x + (x.w || 0) + 2 &&
          p.y >= x.y - 2 && p.y <= x.y + textHeight(x) + 2);
        if (hit) {
          select(hit.id);
          repaint();
          renderSidePanel();
          const node = layer.querySelector(`[data-id="${hit.id}"]`);
          if (node) requestAnimationFrame(() => editText(hit, node));
          return;
        }
        pushUndo();
        /* Room for a few words at the size in force. A flat 260pt was fine at
           16pt and about one word per line at 72. And clicking near the right
           edge used to give a box of NEGATIVE width, which put every word on a
           line of its own — so if there is no room to the right, the box moves
           left to find some. */
        const room = Math.max(80, pg.w - 20);
        const want = Math.min(Math.max(260, S.fontSize * 11), room);
        const floor = Math.min(want, Math.max(70, S.fontSize * 2.4));
        let tw = Math.min(want, pg.w - p.x - 10), tx = p.x;
        if (tw < floor) {
          tw = Math.min(want, Math.max(floor, room));
          tx = Math.max(10, pg.w - 10 - tw);
        }
        const a = { id: uid(), type: 'text', page: pg.n, x: tx, y: p.y, w: tw, text: '', size: S.fontSize, color: S.color, font: S.fontName };
        S.annots.push(a); repaint(); select(a.id);
        const open = () => {
          const node = layer.querySelector(`[data-id="${a.id}"]`);
          if (node) editText(a, node, true);
        };
        // run after this gesture has fully settled, so nothing steals focus back
        window.addEventListener('pointerup', () => requestAnimationFrame(open), { once: true });
      } else if (S.mode === 'hl' || S.mode === 'rect' || S.mode === 'ellipse') {
        pushUndo();
        const a = {
          id: uid(), type: S.mode, page: pg.n, x: p.x, y: p.y, w: 1, h: S.mode === 'hl' ? S.fontSize * 1.1 : 1,
          color: S.mode === 'hl' ? (HL_PALETTE.includes(S.color) ? S.color : HL_PALETTE[0]) : S.color, strokeW: S.strokeW
        };
        S.annots.push(a);
        let node = null;
        /* The drag may go in any direction. Clamping the width to a positive
           number instead of normalising it meant dragging right-to-left, or
           upwards, left a 2pt dot where the box should have been. */
        dragLoop(e, (dx, dy) => {
          const vw = dx / S.zoom, vh = dy / S.zoom;
          a.x = Math.min(p.x, p.x + vw);
          a.w = Math.max(2, Math.abs(vw));
          if (S.mode === 'hl') {
            const hh = Math.abs(vh) || S.fontSize * 1.1;
            a.h = Math.max(S.fontSize * 0.9, hh);
            a.y = vh < 0 ? p.y - a.h : p.y;
          } else {
            a.y = Math.min(p.y, p.y + vh);
            a.h = Math.max(2, Math.abs(vh));
          }
          node = swapNode(layer, a, node);
        }, () => { select(a.id); renderSidePanel(); });
      } else if (S.mode === 'callout') {
        /* The drag starts on the thing being pointed at and ends where the
           note should sit, which is how people describe it: "this bit, and
           here is what I want to say about it". */
        pushUndo();
        const a = {
          id: uid(), type: 'callout', page: pg.n,
          x: p.x, y: p.y, lx: p.x + 40, ly: p.y + 30,
          w: Math.max(90, S.fontSize * 7), text: '', size: S.fontSize,
          color: BRIGHT_PALETTE.includes(S.calloutColor) ? S.calloutColor : BRIGHT_PALETTE[0],
          font: S.fontName, strokeW: Math.max(1.2, S.strokeW * 0.7)
        };
        S.annots.push(a);
        let node = null;
        dragLoop(e, (dx, dy) => {
          a.lx = p.x + dx / S.zoom; a.ly = p.y + dy / S.zoom;
          node = swapNode(layer, a, node);
        }, () => {
          // a tap rather than a drag still gets a note, just off to one side
          if (Math.abs(a.lx - a.x) < 6 && Math.abs(a.ly - a.y) < 6) { a.lx = a.x + 40; a.ly = a.y + 26; }
          select(a.id); repaint(); renderSidePanel();
          const el = layer.querySelector(`[data-id="${a.id}"] .cl-label`);
          if (el) requestAnimationFrame(() => editText(a, el, true));
        });
      } else if (S.mode === 'line' || S.mode === 'arrow') {
        pushUndo();
        // w/h are the vector from tail to tip, so either may be negative
        const a = { id: uid(), type: S.mode, page: pg.n, x: p.x, y: p.y, w: 1, h: 0, color: S.color, strokeW: S.strokeW };
        S.annots.push(a);
        let node = null;
        dragLoop(e, (dx, dy, ev) => {
          let vx = dx / S.zoom, vy = dy / S.zoom;
          if (ev && ev.shiftKey) {
            // snap to the nearest 45 degrees, which is what Shift is for here
            const len = Math.hypot(vx, vy);
            const ang = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
            vx = Math.cos(ang) * len; vy = Math.sin(ang) * len;
          }
          a.w = vx; a.h = vy;
          node = swapNode(layer, a, node);
        }, () => {
          if (Math.hypot(a.w, a.h) < 4) S.annots = S.annots.filter(x => x.id !== a.id);
          else select(a.id);
          repaint(); renderSidePanel();
        });
      } else if (S.mode === 'rub') {
        pushUndo();
        const stroke = { id: uid(), type: 'erase', page: pg.n, pts: [[p.x, p.y]], strokeW: S.rubberW };
        const live = liveInk(layer, stroke, true);
        const ring = rubberRing(layer);
        ring.at(p.x, p.y);
        S.cancelStroke = () => { live.done(); ring.off(); S.undoStack.pop(); S.cancelStroke = null; };
        captureGesture(layer, e, {
          move: ev => {
            let last = null;
            for (const sample of allSamples(ev)) {
              const q = ptFromEvent(sample, layer);
              last = [clamp(q.x, 0, pg.w), clamp(q.y, 0, pg.h)];
              stroke.pts.push(last);
            }
            if (last) ring.at(last[0], last[1]);
            live.update();
          },
          end: async () => {
            if (!S.cancelStroke) return;
            S.cancelStroke = null;
            live.done();
            ring.off();
            const touched = await applyRubber(stroke);
            if (!touched) S.undoStack.pop();          // nothing was under it
            repaint(); renderSidePanel();
          },
          /* The system took the gesture — throw the half-drawn rubber away
             rather than erasing whatever it happened to have crossed. */
          cancel: () => { if (S.cancelStroke) S.cancelStroke(); }
        });
      } else if (S.mode === 'ink') {
        pushUndo();
        const a = { id: uid(), type: 'ink', page: pg.n, pts: [[p.x, p.y, penWidth(e, S.strokeW)]], color: S.color, strokeW: S.strokeW };
        S.annots.push(a);
        /* Draw straight into one live path rather than rebuilding the layer on
           every sample — on a tablet that rebuild is the whole lag. */
        const live = liveInk(layer, a);
        S.cancelStroke = () => {
          live.done();
          S.annots = S.annots.filter(x => x.id !== a.id);
          S.undoStack.pop();
          S.cancelStroke = null;
          repaint();
        };
        captureGesture(layer, e, {
          move: ev => {
            for (const sample of allSamples(ev)) {
              const q = ptFromEvent(sample, layer);
              a.pts.push([clamp(q.x, 0, pg.w), clamp(q.y, 0, pg.h), penWidth(sample, S.strokeW)]);
            }
            live.update();
          },
          end: () => {
            if (!S.cancelStroke) return;            // two fingers already undid it
            S.cancelStroke = null;
            live.done();
            if (a.pts.length < 2) S.annots = S.annots.filter(x => x.id !== a.id);
            repaint();
          },
          cancel: () => { if (S.cancelStroke) S.cancelStroke(); }
        });
      } else if (S.mode === 'img' && S.pendingImage) {
        placePending(pg, p);
      } else if ((S.mode === 'sign' || S.mode === 'seal') && S.pendingSig) {
        placePending(pg, p);
      }
    });
  }

  function placePending(pg, p) {
    const src = S.pendingImage || S.pendingSig;
    if (!src) return;
    pushUndo();
    const maxW = Math.min(src.w, pg.w * (src.maxFrac || 0.5));
    const scale = maxW / src.w;
    const a = { id: uid(), type: 'img', page: pg.n, x: p.x, y: p.y, w: src.w * scale, h: src.h * scale, url: src.url, bytes: src.bytes, fmt: src.fmt };
    S.annots.push(a); repaint(); select(a.id);
    S.pendingImage = null; S.pendingSig = null;
    S.mode = 'select';
    $('#wb-rail').querySelectorAll('.trb').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === 'select'));
    renderSidePanel();
  }

  function dragLoop(e, onMove, onEnd) {
    const sx = e.clientX, sy = e.clientY;
    /* Capture on the stage, never on the thing being dragged. Selecting an object
       repaints the layer before the drag starts, and every frame of the drag
       rebuilds it again, so the element that received the pointerdown is already
       detached — and capturing a detached element throws. That is why a picture
       would not move at all and a resize stopped after one step. */
    const host = $('#wb-stage') || null;
    if (host) {
      captureGesture(host, e, {
        move: ev => { const last = allSamples(ev).pop(); onMove(last.clientX - sx, last.clientY - sy, last); },
        end: () => { if (onEnd) onEnd(); },
        /* A drag has already moved the object as it went, so a cancelled one
           settles where it is — but it must still settle, or the object stays
           selected-but-mid-drag and the next repaint drops it back. */
        cancel: () => { if (onEnd) onEnd(); }
      });
      return;
    }
    const move = ev => onMove(ev.clientX - sx, ev.clientY - sy, ev);
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      if (onEnd) onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }

  /* Replace one object's element in place. Re-creating a single node while
     dragging costs nothing; rebuilding every object on the page does. */
  function swapNode(layer, a, node) {
    const fresh = annotEl(a);
    if (node && node.parentNode === layer) layer.replaceChild(fresh, node);
    else layer.append(fresh);
    return fresh;
  }

  /* A single path element that grows as the stroke is drawn. */
  function liveInk(layer, a, rubber) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'liveink');
    svg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:7';
    svg.setAttribute('viewBox', `0 0 ${layer.clientWidth || 1} ${layer.clientHeight || 1}`);
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', rubber ? 'var(--mark)' : a.color);
    path.setAttribute('stroke-opacity', rubber ? '0.35' : '1');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    layer.append(svg);
    const z = S.zoom;
    const update = () => {
      path.setAttribute('d', a.pts.map((p, i) => (i ? 'L' : 'M') + (p[0] * z).toFixed(1) + ' ' + (p[1] * z).toFixed(1)).join(' '));
      const last = a.pts[a.pts.length - 1];
      path.setAttribute('stroke-width', ((rubber ? a.strokeW : (last[2] || a.strokeW)) * z).toFixed(2));
    };
    update();
    return { update, done: () => svg.remove() };
  }

  /* The second press of a double-click on a text box, so it can be re-opened.

     A `dblclick` listener cannot work here, and nor can a `click` one: pressing
     an object selects it, selecting repaints the layer, and the element under
     the pointer is therefore replaced between mousedown and mouseup — so the
     browser never produces a click event at all, let alone a double one. That
     left no way back into a text box to fix a typo. Timing the presses does
     work, because each press lands on whatever element is current. */
  let lastTextPress = null;

  function onAnnotDown(e, a, node) {
    e.stopPropagation();
    if (node.getAttribute('contenteditable') === 'true') return;
    if ((a.type === 'text' || a.type === 'callout') && S.mode === 'select') {
      const now = Date.now();
      if (lastTextPress && lastTextPress.id === a.id && now - lastTextPress.t < 450) {
        lastTextPress = null;
        e.preventDefault();
        // a comment's words live in its label, not in the object's own box
        const target = a.type === 'callout' ? node.querySelector('.cl-label') : node;
        if (target) editText(a, target);
        return;
      }
      lastTextPress = { id: a.id, t: now };
    }
    select(a.id);
    renderSidePanel();
    const ox = a.x, oy = a.y, opts = a.pts ? a.pts.map(p => p.slice()) : null;
    const olx = a.lx, oly = a.ly;          // a comment carries its note with it
    let moved = false;
    pushUndo();
    /* Keep a grabbable piece of the object on the page. Dragged far enough, its
       corner handle ends up off the stage or under the panel, and then it can
       never be resized again — besides which, nothing off the page prints. */
    const pg = S.doc.pages[a.page - 1];
    const EDGE = 24;
    dragLoop(e, (dx, dy) => {
      moved = true;
      let mx = dx / S.zoom, my = dy / S.zoom;
      if (a.pts) {
        const xs = opts.map(q => q[0]), ys = opts.map(q => q[1]);
        const bx = Math.min(...xs), by = Math.min(...ys);
        const bw = Math.max(...xs) - bx, bh = Math.max(...ys) - by;
        mx = clamp(bx + mx, -bw + EDGE, pg.w - EDGE) - bx;
        my = clamp(by + my, -bh + EDGE, pg.h - EDGE) - by;
        /* carry the third element through: it is the width the pencil's
           pressure gave that sample, and dropping it flattened a
           pressure-varying stroke to a uniform line as soon as it was moved */
        a.pts = opts.map(q => q.length > 2 ? [q[0] + mx, q[1] + my, q[2]] : [q[0] + mx, q[1] + my]);
      } else if (a.type === 'callout') {
        const b = shapeBox(a);
        mx = clamp(b.x + mx, -b.w + EDGE, pg.w - EDGE) - b.x;
        my = clamp(b.y + my, -b.h + EDGE, pg.h - EDGE) - b.y;
        a.x = ox + mx; a.y = oy + my;
        a.lx = olx + mx; a.ly = oly + my;
      } else {
        a.x = clamp(ox + mx, -(a.w || 0) + EDGE, pg.w - EDGE);
        a.y = clamp(oy + my, -(a.h || 0) + EDGE, pg.h - EDGE);
      }
      repaint();
    }, () => { if (!moved) S.undoStack.pop(); });
  }

  function onResize(e, a) {
    e.stopPropagation();
    const ow = a.w, oh = a.h, os = a.size;
    pushUndo();
    dragLoop(e, (dx, dy) => {
      if (a.type === 'callout') {          // the handle sets how wide the note is
        a.w = Math.max(a.size * 3, ow + dx / S.zoom);
        repaint(); return;
      }
      if (a.type === 'arrow' || a.type === 'line') {   // the handle is the tip: any direction
        a.w = ow + dx / S.zoom; a.h = oh + dy / S.zoom;
        repaint(); return;
      }
      if (a.type === 'text') {
        /* The handle SCALES a text box: the type size moves with the width.
           So clamp the scale, not the width. Clamping the width alone let the
           box shrink to 8pt while the size stopped at its 6pt floor — and a
           14px-wide box full of 6pt text puts one letter on each line, which
           is what "the text keeps going vertical" was. */
        const k = clamp((ow + dx / S.zoom) / Math.max(1, ow), 6 / os, 400 / os);
        a.size = Math.max(6, Math.round(os * k));
        a.w = Math.max(minTextWidth(a), ow * k);
        repaint();
        return;
      }
      a.w = Math.max(8, ow + dx / S.zoom);
      a.h = Math.max(4, oh + dy / S.zoom);
      repaint();
    });
  }

  function editText(a, node, selectAll) {
    if (node.getAttribute('contenteditable')) return;      // already open
    /* Nothing but the text itself may be inside the box while it is being
       typed into. The resize handle lives in here, and an empty box has
       nothing else for the caret to go into. */
    node.querySelectorAll('.handle, .movebar, .wrapgrip').forEach(n => n.remove());
    /* Whichever tool is up, an open box must take the pointer: outside Select
       the objects are click-through, and a caret cannot be placed in something
       the pointer passes straight through. */
    node.style.pointerEvents = 'auto';
    node.setAttribute('contenteditable', 'plaintext-only');
    if (node.getAttribute('contenteditable') !== 'plaintext-only') node.setAttribute('contenteditable', 'true');
    node.style.userSelect = 'text';
    node.classList.add('editing');
    node.focus({ preventScroll: true });
    if (selectAll) {
      const r = document.createRange(); r.selectNodeContents(node);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      node.removeEventListener('blur', finish);
      node.removeAttribute('contenteditable');
      node.classList.remove('editing');
      /* read the typed text only — never a stray control that found its way in */
      const copy = node.cloneNode(true);
      copy.querySelectorAll('.handle, .movebar, .wrapgrip').forEach(n => n.remove());
      const v = copy.textContent.replace(/\u00a0/g, ' ');
      if (v !== a.text) a.text = v;
      if (!a.text.trim()) S.annots = S.annots.filter(x => x.id !== a.id);
      else if (a.type === 'callout') select(a.id);
      /* The node is torn down from inside its own blur handler, so hand the
         rebuild to the next task rather than removing the node mid-dispatch. */
      setTimeout(() => { repaint(); renderSidePanel(); }, 0);
    };
    node.addEventListener('blur', finish);
    node.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) {
        ev.preventDefault(); node.blur();
      }
    });
  }

  /* Rub out what the stroke passed over. Pen strokes are cut exactly; anything
     else is re-drawn once as a picture with those pixels knocked out. */
  async function applyRubber(stroke) {
    const r = stroke.strokeW / 2;
    const next = [];
    let touched = false;
    const redraw = [];
    for (const a of S.annots) {
      if (a.page !== stroke.page || a.type === 'erase') { next.push(a); continue; }
      if (a.type === 'ink') {
        const runs = splitInk(a, stroke, r);
        if (runs === null) { next.push(a); continue; }
        touched = true;
        for (const run of runs) next.push(Object.assign({}, a, { id: uid(), pts: run }));
        continue;
      }
      if (rubberHitsBox(shapeBox(a), stroke, r)) { touched = true; redraw.push(a); next.push(a); continue; }
      next.push(a);
    }
    S.annots = next;
    for (const a of redraw) {
      try {
        const flat = await rubberise(a, [stroke]);
        if (flat) {
          const i = S.annots.findIndex(x => x.id === a.id);
          if (i >= 0) S.annots[i] = flat;
        }
      } catch (err) { console.error(err); toast('That object could not be rubbed out.', true); }
    }
    if (touched) select(null);
    return touched;
  }

  function select(id) {
    S.sel = id;
    repaint();
    if (id === null) renderSidePanel();
  }

  /* A snapshot used to be JSON. That quietly destroyed every picture on the
     page: an image's bytes are a Uint8Array, and JSON turns one into
     {"0":137,"1":80,…} with no length, so the next save threw inside the PNG
     writer and the whole export failed. It was also the reason forty snapshots
     weighed tens of megabytes — six bytes of JSON per byte of image.

     Clone by hand instead. Everything the editor mutates is copied; the byte
     arrays are never written to once created, so a snapshot can share them. */
  function cloneAnnot(a) {
    const c = {};
    for (const k in a) {
      const v = a[k];
      if (v instanceof Uint8Array) c[k] = v;                 // immutable — share it
      else if (Array.isArray(v)) c[k] = v.map(p => Array.isArray(p) ? p.slice() : p);
      else if (v && typeof v === 'object') c[k] = Object.assign({}, v);
      else c[k] = v;
    }
    return c;
  }

  /* The document's own text runs carry edit state of their own — what the line
     now says, where it was dragged to, which patch objects belong to it. Undo
     has to put those back as well, or the paragraph keeps the new text on
     screen while the objects that drew it are gone. */
  const RUNKEYS = ['str', 'rows', 'h', 'w', 'dx', 'dy', 'edited', 'annotIds', 'fit'];
  function snapRuns() {
    const out = [];
    for (const rec of S.pageEls) {
      if (!rec.runs) continue;
      out.push({
        rec, state: rec.runs.map(r => {
          const o = {};
          for (const k of RUNKEYS) o[k] = Array.isArray(r[k]) ? r[k].slice() : r[k];
          return o;
        })
      });
    }
    return out;
  }
  function applyRuns(snap) {
    if (!snap) return;
    for (const { rec, state } of snap) {
      if (!rec.runs || rec.runs.length !== state.length) continue;
      rec.runs.forEach((r, i) => {
        const o = state[i];
        for (const k of RUNKEYS) r[k] = Array.isArray(o[k]) ? o[k].slice() : o[k];
      });
      if (rec.tlayer && !rec.tlayer.hidden) paintTextLayer(rec);
    }
  }

  const snapshot = () => ({ annots: S.annots.map(cloneAnnot), runs: snapRuns() });

  function pushUndo() {
    S.undoStack.push(snapshot());
    if (S.undoStack.length > 40) S.undoStack.shift();
    S.redoStack.length = 0;
  }
  function restore(snap) {
    S.annots = snap.annots;
    applyRuns(snap.runs);
    S.sel = null; repaint(); renderSidePanel();
  }
  function undo() {
    if (!S.undoStack.length) return;
    S.redoStack.push(snapshot());
    restore(S.undoStack.pop());
  }
  function redo() {
    if (!S.redoStack.length) return;
    S.undoStack.push(snapshot());
    restore(S.redoStack.pop());
  }

  async function insertImage() {
    const f = await pickFile('image/png,image/jpeg,image/webp');
    S.mode = 'select';
    if (!f) { syncRail(); renderSidePanel(); return; }
    try {
      const img = await loadImageFile(f);
      S.pendingImage = img;
      /* With a finger, asking for a second tap to place it is a step people
         lose the picture on. Drop it on the page they are looking at instead;
         it arrives selected and can be dragged anywhere. */
      if (coarsePointer()) {
        const rec = visiblePage();
        if (rec) {
          placePending(rec.pg, { x: Math.max(12, rec.pg.w / 2 - 60), y: Math.max(12, visibleTop(rec) + 40) });
          toast('Image placed — drag it where you want it');
          return;
        }
      }
      S.mode = 'img';
      syncRail();
      toast('Click a page to place the image');
    } catch (e) { toast('That image could not be read.', true); }
    renderSidePanel();
  }

  /* Put a saved signature or stamp on the page. Same two-step as Add image:
     with a mouse you choose where it lands, with a finger it is dropped onto
     the page you are looking at, because asking for a second tap is where
     people lose it. */
  async function placeSaved(a) {
    try {
      const bytes = inkBytes(a);
      if (S.pendingSig && S.pendingSig.url && S.pendingSig.url.startsWith('blob:')) {
        try { URL.revokeObjectURL(S.pendingSig.url); } catch (e) {}
      }
      /* the photograph is captured at roughly twice the size it wants to be
         printed, so halve it into points and let the page cap it */
      S.pendingSig = {
        url: a.data, bytes, fmt: 'png',
        w: a.width / 2, h: a.height / 2,
        maxFrac: a.kind === 'stamp' ? 0.25 : 0.42
      };
      if (coarsePointer()) {
        const rec = visiblePage();
        if (rec) {
          placePending(rec.pg, { x: Math.max(12, rec.pg.w / 2 - 60), y: Math.max(12, visibleTop(rec) + 40) });
          toast(a.name + ' placed \u2014 drag it where you want it');
          return;
        }
      }
      S.mode = 'seal';
      syncRail();
      renderSidePanel();
      toast('Click the page to place ' + a.name + '.');
    } catch (e) {
      console.error(e);
      toast('That saved ink could not be read.', true);
    }
  }

  function removeInk(a) {
    confirmSheet('Delete this ink?',
      '\u201c' + a.name + '\u201d will be removed from this browser. Copies already placed on the document stay where they are.',
      'Delete', async () => {
        try { await inkStore('delete', a.id); } catch (e) { /* a session-only item has nothing stored to remove */ }
        S.ink = (S.ink || []).filter(x => x.id !== a.id);
        renderSidePanel();
        toast('\u201c' + a.name + '\u201d deleted.');
      });
  }

  /* the page the reader is actually looking at */
  function visiblePage() {
    const stage = $('#wb-stage');
    const mid = stage.scrollTop + stage.clientHeight / 2;
    let best = null, bestD = Infinity;
    for (const r of S.pageEls) {
      const top = r.box.offsetTop, bottom = top + r.box.offsetHeight;
      const d = (mid < top) ? top - mid : (mid > bottom ? mid - bottom : 0);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }
  /* how far down that page the viewport starts, in page points */
  function visibleTop(rec) {
    const stage = $('#wb-stage');
    return clamp((stage.scrollTop - rec.box.offsetTop) / S.zoom, 0, Math.max(0, rec.pg.h - 80));
  }

  function signatureDialog() {
    modal((box, close) => {
      const cv = h('canvas', { id: 'sigpad' });
      let drawing = false, last = null, any = false;
      const ctx = () => cv.getContext('2d');
      const resize = () => {
        const r = cv.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = r.width * dpr; cv.height = r.height * dpr;
        const c = ctx(); c.scale(dpr, dpr); c.lineWidth = 2.4; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#111827';
      };
      cv.addEventListener('pointerdown', e => {
        drawing = true; any = true;
        const r = cv.getBoundingClientRect(); last = [e.clientX - r.left, e.clientY - r.top];
        cv.setPointerCapture(e.pointerId);
      });
      cv.addEventListener('pointermove', e => {
        if (!drawing) return;
        const r = cv.getBoundingClientRect();
        const p = [e.clientX - r.left, e.clientY - r.top];
        const c = ctx(); c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(p[0], p[1]); c.stroke();
        last = p;
      });
      cv.addEventListener('pointerup', () => drawing = false);

      box.append(
        h('h3', null, 'Draw your signature'),
        h('p', null, 'Use a mouse, trackpad or finger. It is kept in this page only, for as long as the tab is open.'),
        cv,
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => { const c = ctx(); c.clearRect(0, 0, cv.width, cv.height); any = false; } }, 'Clear'),
          h('button', { class: 'btn', onclick: () => { S.mode = 'select'; close(); renderSidePanel(); } }, 'Cancel'),
          h('button', {
            class: 'btn primary', onclick: async () => {
              if (!any) { toast('Draw a signature first.', true); return; }
              const trimmed = trimCanvas(cv);
              const blob = await toBlobOrThrow(trimmed, 'image/png');
              const bytes = new Uint8Array(await blob.arrayBuffer());
              // a signature drawn and then redrawn left the first one's URL behind
              if (S.pendingSig && S.pendingSig.url) { try { URL.revokeObjectURL(S.pendingSig.url); } catch (e2) {} }
              S.pendingSig = { url: URL.createObjectURL(blob), bytes, fmt: 'png', w: trimmed.width / 2, h: trimmed.height / 2 };
              close();
              toast('Click on a page to place your signature');
            }
          }, 'Use signature')
        )
      );
      requestAnimationFrame(resize);
    }, () => {
      // dismissed however: leave the rail in a state that matches reality
      if (S.mode === 'sign' && !S.pendingSig) { S.mode = 'select'; syncRail(); renderSidePanel(); }
    });
  }

  /* The Stamp & sign sheet offers "Draw" alongside the two photo buttons, but
     it is built outside this mount and the pad lives in here. Hand it over for
     as long as the editor is up. */
  S.drawSignature = signatureDialog;
  onCleanup(() => { if (S.drawSignature === signatureDialog) S.drawSignature = null; });

  /* ---- write the edited document ---- */
  let exporting = false;
  async function exportEdited() {
    if (exporting) { toast('Still writing the PDF.', true); return; }
    if (!S.annots.length) { toast('Nothing has been added yet.', true); return; }
    exporting = true;
    progress(0.05);
    try {
      const out = await PDFDocument.load(S.doc.bytes.slice(0), { ignoreEncryption: true, updateMetadata: false });
      const fontCache = {};
      const getFont = async name => fontCache[name] || (fontCache[name] = await out.embedFont(StandardFonts[name] || StandardFonts.Helvetica));
      const pages = out.getPages();
      let done = 0, folded = false;

      for (const a of S.annots) {
        const page = pages[a.page - 1];
        if (!page) continue;
        /* Every coordinate on screen came from a pdf.js viewport, and pdf.js
           lays a page out on its CROP box. pdf-lib's getSize reports the MEDIA
           box, and the two are not the same file to file: a press-ready PDF
           typically crops a bleed off a larger sheet. Building the transform
           from the media box put every annotation out by the difference —
           several millimetres on a trimmed page, and the whole bleed on a
           badly trimmed one. Take the crop box, origin included. */
        const crop = pageCrop(page);
        const W = crop.width, H = crop.height;
        const R = ((page.getRotation().angle % 360) + 360) % 360;
        const map = (dx, dy, dw = 0, dh = 0) => {
          let p;
          if (R === 90) p = { x: dy + dh, y: dx };
          else if (R === 180) p = { x: W - dx, y: dy + dh };
          else if (R === 270) p = { x: W - dy - dh, y: H - dx };
          else p = { x: dx, y: H - dy - dh };
          return { x: p.x + crop.x, y: p.y + crop.y };
        };

        if (a.type === 'text') {
          fixTextBox(a, W);              // what is written must match what was shown
          let font = await getFont(a.font);
          let body = a.text;
          if (!canWrite(font, body)) {
            const sym = await getFont('Symbol');
            if (canWrite(sym, body)) font = sym;          // Greek / maths run
            else {
              const safe = toWinAnsi(body);
              if (safe.changed) folded = true;
              body = safe.text;
            }
          }
          const lines = wrapText(body, font, a.size, a.w);
          const nudge = a.weight === 'semi' ? a.size * 0.038 : 0;   // simulated semibold
          const lh = a.lh || a.size * 1.22;
          lines.forEach((line, i) => {
            const p = map(a.x, a.y + a.size * 0.82 + i * lh);
            const opts = { x: p.x, y: p.y, size: a.size, font, color: hex2rgb(a.color), rotate: degrees(R) };
            page.drawText(line, opts);
            if (nudge) {
              const q = map(a.x + nudge, a.y + a.size * 0.82 + i * lh);
              page.drawText(line, Object.assign({}, opts, { x: q.x, y: q.y }));
            }
          });
        } else if (a.type === 'hl') {
          const p = map(a.x, a.y, a.w, a.h);
          page.drawRectangle({
            x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(R),
            color: hex2rgb(a.color), opacity: 0.45, blendMode: BlendMode.Multiply
          });
        } else if (a.type === 'rect') {
          const p = map(a.x, a.y, a.w, a.h);
          page.drawRectangle({
            x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(R),
            borderColor: hex2rgb(a.color), borderWidth: a.strokeW
          });
        } else if (a.type === 'ellipse') {
          const c = map(a.x + a.w / 2, a.y + a.h / 2);
          const swap = R === 90 || R === 270;
          page.drawEllipse({
            x: c.x, y: c.y,
            xScale: Math.abs((swap ? a.h : a.w) / 2), yScale: Math.abs((swap ? a.w : a.h) / 2),
            borderColor: hex2rgb(a.color), borderWidth: a.strokeW, opacity: 0
          });
        } else if (a.type === 'arrow') {
          const hd = arrowHead(a);
          const line = (ax, ay, bx, by) => page.drawLine({
            start: map(ax, ay), end: map(bx, by),
            thickness: a.strokeW, color: hex2rgb(a.color), lineCap: 1
          });
          line(a.x, a.y, a.x + a.w, a.y + a.h);
          line(hd.l[0], hd.l[1], a.x + a.w, a.y + a.h);
          line(hd.r[0], hd.r[1], a.x + a.w, a.y + a.h);
        } else if (a.type === 'line') {
          page.drawLine({
            start: map(a.x, a.y), end: map(a.x + a.w, a.y + a.h),
            thickness: a.strokeW, color: hex2rgb(a.color), lineCap: 1
          });
        } else if (a.type === 'callout') {
          const g = calloutGeom(a);
          const stem = { x: g.from.x, y: g.from.y, w: g.tip.x - g.from.x, h: g.tip.y - g.from.y, strokeW: a.strokeW };
          const hd = arrowHead(stem);
          const line = (ax, ay, bx, by) => page.drawLine({
            start: map(ax, ay), end: map(bx, by),
            thickness: g.bw, color: hex2rgb(a.color), lineCap: 1
          });
          // the note first, so the arrow meets its edge rather than sitting under it
          const lp = map(g.label.x, g.label.y, g.label.w, g.label.h);
          page.drawRectangle({
            x: lp.x, y: lp.y, width: g.label.w, height: g.label.h, rotate: degrees(R),
            color: rgb(1, 1, 1), borderColor: hex2rgb(a.color), borderWidth: g.bw
          });
          line(g.from.x, g.from.y, g.tip.x, g.tip.y);
          line(hd.l[0], hd.l[1], g.tip.x, g.tip.y);
          line(hd.r[0], hd.r[1], g.tip.x, g.tip.y);
          let cfont = await getFont(withFmtNone(a.font));
          let body = a.text;
          if (!canWrite(cfont, body)) {
            const safe = toWinAnsi(body);
            if (safe.changed) folded = true;
            body = safe.text;
          }
          const inner = g.label.x + g.pad + g.bw;
          wrapText(body, cfont, a.size, g.inner).forEach((ln, i) => {
            const q = map(inner, g.label.y + g.pad + g.bw + a.size * 0.84 + i * g.lh);
            page.drawText(ln, { x: q.x, y: q.y, size: a.size, font: cfont, color: hex2rgb(a.color), rotate: degrees(R) });
          });
        } else if (a.type === 'erase') {
          continue;                     // a rubbing is not something to draw
        } else if (a.type === 'cover') {
          const p = map(a.x, a.y, a.w, a.h);
          page.drawRectangle({
            x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(R), color: hex2rgb(a.color)
          });
        } else if (a.type === 'ink') {
          for (let i = 1; i < a.pts.length; i++) {
            const s = map(a.pts[i - 1][0], a.pts[i - 1][1]);
            const e = map(a.pts[i][0], a.pts[i][1]);
            // the pencil's pressure, segment by segment
            const t = ((a.pts[i][2] || a.strokeW) + (a.pts[i - 1][2] || a.strokeW)) / 2;
            page.drawLine({ start: s, end: e, thickness: t, color: hex2rgb(a.color), lineCap: 1 });
          }
        } else if (a.type === 'img') {
          const baked = await bakeImage(a);
          const emb = baked.fmt === 'png' ? await out.embedPng(baked.bytes) : await out.embedJpg(baked.bytes);
          const p = map(a.x, a.y, a.w, a.h);
          const opts = { x: p.x, y: p.y, width: a.w, height: a.h, rotate: degrees(R) };
          if (a.opacity != null && a.opacity < 1) opts.opacity = a.opacity;
          page.drawImage(emb, opts);
        }
        progress(0.05 + 0.9 * (++done / S.annots.length));
      }

      const bytes = await out.save();
      progress(1);
      if (folded) toast('Some characters are outside what the standard PDF fonts can encode and were replaced.', true);
      await offerFile(outName(S.doc.name, '-edited'), bytes);
    } catch (e) {
      console.error(e);
      toast('Could not write the PDF: ' + (e.message || 'unknown error'), true);
    } finally { exporting = false; setTimeout(() => progress(null), 400); }
  }
}

/* Map an embedded font's name onto the nearest of the 14 standard fonts.
   Embedded names look like "ABCDEF+TimesNewRomanPS-BoldMT" or "ArialMT". */
/* Real documents use weights the 14 standard fonts do not have. Semibold,
   demibold and medium are much lighter than Helvetica-Bold, so promoting them
   to bold is the single most visible thing a substitution gets wrong. Those are
   classified separately and drawn by overprinting the regular cut, which lands
   between the two. Light and thin have no lighter standard cut, so they stay
   regular. */
function weightClass(name) {
  const n = String(name || '').replace(/^[A-Z]{6}\+/, '').toLowerCase();
  if (/semibold|demibold|\bdemi\b|\bmedium\b|\bmed\b|\bsb\b/.test(n)) return 'semi';
  if (/extrabold|ultrabold|black|heavy|bold|[-_]bd\b|[-_]bo\b/.test(n)) return 'bold';
  return 'regular';
}

function guessStdFont(name) {
  const n = String(name || '').toLowerCase();
  const bold = weightClass(name) === 'bold';
  const ital = /italic|oblique|[-_]it\b/.test(n);
  if (/times|serif|roman|georgia|garamond|book|minion|cambria|constantia|palatino|baskerville|caslon|bodoni|didot|sabon|charter|utopia|merriweather|playfair|lora|literata|newsreader|crimson|spectral|schoolbook|rockwell|clarendon|slab|perpetua|plantin|janson|cochin|tinos/.test(n) && !/sans/.test(n))
    return bold && ital ? 'TimesRomanBoldItalic' : bold ? 'TimesRomanBold' : ital ? 'TimesRomanItalic' : 'TimesRoman';
  if (/courier|mono|consol|menlo|monaco|inconsolata|andale|cascadia|hack\b|jetbrains|source\s*code|fira\s*code|anonymous\s*pro|iosevka|terminus/.test(n))
    return bold && ital ? 'CourierBoldOblique' : bold ? 'CourierBold' : ital ? 'CourierOblique' : 'Courier';
  return bold && ital ? 'HelveticaBoldOblique' : bold ? 'HelveticaBold' : ital ? 'HelveticaOblique' : 'Helvetica';
}

/* Where a browser puts the first baseline inside a line box depends on the
   font's own metrics, so measure it once per face instead of assuming. Without
   this the preview sits ~0.2em below where the PDF will actually draw. */
const BASELINE = new Map();
/* `lead` is the line-height the element will actually use, as a multiple of the
   font size. It has to be measured with that leading: the probe used to assume
   1.22 while the editor sets the document's own, so on a tightly or loosely led
   paragraph the preview sat a fraction of a line off where the PDF would draw
   it, and the text shifted the moment it was committed. */
function baselineEm(family, weight, style, lead) {
  const lh = (typeof lead === 'number' && isFinite(lead) && lead > 0) ? +lead.toFixed(3) : 1.22;
  const key = family + '|' + weight + '|' + style + '|' + lh;
  if (BASELINE.has(key)) return BASELINE.get(key);
  let v = 1.015;
  try {
    const probe = h('span', { style: `position:absolute;left:-9999px;top:0;visibility:hidden;font-family:${family};font-weight:${weight};font-style:${style};font-size:100px;line-height:${lh}` }, 'Hxy');
    const mark = h('span', { style: 'display:inline-block;width:0;height:0;vertical-align:baseline' });
    probe.append(mark);
    document.body.append(probe);
    const r = (mark.getBoundingClientRect().top - probe.getBoundingClientRect().top) / 100;
    probe.remove();
    if (isFinite(r) && r > 0.4 && r < 2) v = r;
  } catch (e) {}
  BASELINE.set(key, v);
  return v;
}

/* The preview must render at the same metrics the PDF will use, so fall back
   through the metric-compatible clones rather than letting the platform pick
   whatever sans it happens to have — on Linux that is a much larger face and
   the preview would not match the exported file. */
function fontCss(f) {
  if (/Times/.test(f)) return '"Times New Roman", Times, "Liberation Serif", "Nimbus Roman", Tinos, "TeX Gyre Termes", serif';
  if (/Courier/.test(f)) return '"Courier New", Courier, "Liberation Mono", "Nimbus Mono PS", Cousine, "TeX Gyre Cursor", monospace';
  return 'Helvetica, Arial, "Liberation Sans", "Nimbus Sans", Arimo, "TeX Gyre Heros", sans-serif';
}

/* A comment's label is written in the face it was created with; the side
   panel's type overrides belong to the document-text editor, not to this. */
function withFmtNone(f) { return StandardFonts[f] ? f : 'Helvetica'; }

/* The box pdf.js actually laid the page out on, as {x, y, width, height} in
   PDF user space. Falls back to the media box on a file that declares no crop
   box, and to getSize if this build of pdf-lib has neither. */
function pageCrop(page) {
  for (const get of ['getCropBox', 'getMediaBox']) {
    try {
      const b = typeof page[get] === 'function' ? page[get]() : null;
      if (b && b.width > 0 && b.height > 0) {
        return { x: b.x || 0, y: b.y || 0, width: b.width, height: b.height };
      }
    } catch (e) {}
  }
  const s = page.getSize();
  return { x: 0, y: 0, width: s.width, height: s.height };
}

/* canvas.toBlob hands back null rather than throwing when the browser will not
   encode the canvas — most often because it is larger than the platform allows
   (iOS has a hard cap). Every caller here went on to use that null as a blob,
   which failed somewhere further along with a message about the wrong thing. */
function toBlobOrThrow(canvas, type, quality) {
  return new Promise((res, rej) => {
    try {
      canvas.toBlob(b => b ? res(b)
        : rej(new Error('this browser could not encode an image that large (' +
            canvas.width + '\u00d7' + canvas.height + ' pixels)')),
        type, quality);
    } catch (e) { rej(e); }
  });
}

const toHex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

/* Read the page canvas behind a text run: the dominant colour is the paper to
   patch over it with, the darkest is a fair guess at the ink. */
function sampleRun(canvas, pgW, pgH, box) {
  const def = { bg: '#ffffff', fg: '#141922', ink: [20, 25, 34], paper: [255, 255, 255], busy: false };
  try {
    if (!canvas || !canvas.width) return def;
    const sx = canvas.width / pgW, sy = canvas.height / pgH;
    const x0 = clamp(Math.floor(box.x * sx), 0, canvas.width - 1);
    const y0 = clamp(Math.floor(box.y * sy), 0, canvas.height - 1);
    const w = clamp(Math.ceil(box.w * sx), 1, canvas.width - x0);
    const hh = clamp(Math.ceil(box.h * sy), 1, canvas.height - y0);
    if (w < 2 || hh < 2) return def;
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, hh).data;
    const counts = new Map(), repr = new Map();
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;                 // nothing drawn here yet
      const R = d[i], G = d[i + 1], B = d[i + 2];
      const key = ((R >> 3) << 10) | ((G >> 3) << 5) | (B >> 3);
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!repr.has(key)) repr.set(key, [R, G, B]);
      total++;
    }
    let best = 0, bk = null;
    for (const [k, v] of counts) if (v > best) { best = v; bk = k; }
    if (bk === null) return def;
    const bg = repr.get(bk);
    // the ink is the colour that most of the SOLID glyph pixels share. Taking the
    // darkest pixel instead returns black for red text that sits beside black.
    let far = 0;
    for (let i = 0; i < d.length; i += 4) {
      const e = (d[i] - bg[0]) ** 2 + (d[i + 1] - bg[1]) ** 2 + (d[i + 2] - bg[2]) ** 2;
      if (e > far) far = e;
    }
    let fg = null;
    if (far > 900) {
      const solid = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const e = (d[i] - bg[0]) ** 2 + (d[i + 1] - bg[1]) ** 2 + (d[i + 2] - bg[2]) ** 2;
        if (e < far * 0.55) continue;                     // skip paper and antialiasing
        const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
        let a = solid.get(k);
        if (!a) solid.set(k, a = [0, 0, 0, 0]);
        a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; a[3]++;
      }
      let sb = 0, sa = null;
      for (const a of solid.values()) if (a[3] > sb) { sb = a[3]; sa = a; }
      if (sa) fg = [sa[0] / sa[3], sa[1] / sa[3], sa[2] / sa[3]];   // average the bucket
    }
    if (!fg) {
      const bgL = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
      fg = bgL > 128 ? [20, 25, 34] : [245, 245, 245];
    }
    return { bg: toHex(bg), fg: toHex(fg), ink: fg, paper: bg, busy: best / Math.max(1, total) < 0.42 };
  } catch (e) { return def; }
}

/* Why a replacement can look the wrong size, and what to do about it.

   A substitute is matched on point size, but what the eye compares is x-height,
   and that varies a lot between faces. Calibri's x-height is 0.466 em against
   Helvetica's 0.523, so Helvetica set at Calibri's point size reads about 12%
   too big. Each factor below is that face's x-height divided by the x-height of
   the standard font it gets replaced by — Helvetica 0.523, Times 0.450,
   Courier 0.426 — rounded to two places and held inside 0.80-1.25.

   These are published metrics rather than measurements: measuring rasterised
   glyphs gave different answers for identical lines depending on what else sat
   near them on the page. A face that is not listed is left alone. */
const FACE_SCALE = [
  // --- sans, replaced by Helvetica (x-height 0.523) ---
  [/calibri/i,                                  0.89],
  [/candara|corbel/i,                           0.90],
  [/segoe/i,                                    0.96],
  [/verdana|tahoma|dejavu\s*sans(?!\s*mono)|bitstream\s*vera/i, 1.04],
  [/trebuchet|franklin|raleway|ubuntu/i,        0.99],
  [/myriad/i,                                   0.93],
  [/frutiger|univers|work\s*sans|pt\s*sans/i,   0.96],
  [/avenir/i,                                   0.90],
  [/futura|gill\s*sans/i,                       0.86],
  [/optima/i,                                   0.92],
  [/century\s*gothic/i,                         0.93],
  [/lato/i,                                     0.97],
  [/nunito/i,                                   0.94],
  [/open\s*sans|noto\s*sans/i,                  1.02],
  [/source\s*sans/i,                            0.93],
  [/roboto(?!\s*mono|\s*slab)/i,                1.01],
  [/fira\s*sans/i,                              1.01],
  [/montserrat/i,                               0.99],
  [/poppins/i,                                  1.05],
  [/inter(?!\s*state)/i,                        1.04],
  [/lucida\s*(grande|sans)|geneva/i,            1.01],
  // --- serif, replaced by Times (x-height 0.450) ---
  [/georgia/i,                                  1.08],
  [/cambria|constantia|minion/i,                1.04],
  [/palatino|book\s*antiqua/i,                  1.04],
  [/bookman|century\s*schoolbook/i,             1.09],
  [/charter|utopia/i,                           1.07],
  [/garamond/i,                                 0.85],
  [/baskerville|caslon|sabon/i,                 0.89],
  [/bodoni|didot/i,                             0.91],
  [/crimson|spectral/i,                         0.96],
  [/merriweather|noto\s*serif|libre\s*baskerville/i, 1.18],
  [/pt\s*serif|playfair|lora|literata|newsreader/i,  1.15],
  [/source\s*serif|droid\s*serif/i,             1.06],
  [/rockwell|clarendon|roboto\s*slab/i,         1.09],
  // --- monospace, replaced by Courier (x-height 0.426) ---
  [/consolas|menlo|jetbrains|dejavu\s*sans\s*mono/i, 1.25],
  [/monaco|lucida\s*console|fira\s*(code|mono)|roboto\s*mono/i, 1.24],
  [/andale|ibm\s*plex\s*mono|cascadia/i,        1.21],
  [/source\s*code|inconsolata|hack\b/i,         1.15]
];
function faceScale(face) {
  const n = String(face || '').replace(/^[A-Z]{6}\+/, '');   // drop the subset prefix
  for (const [re, k] of FACE_SCALE) if (re.test(n)) return k;
  return 1;
}

/* The Symbol font covers Greek and the common maths operators, so a run made of
   those can still be written faithfully. Everything else: the 14 standard PDF
   fonts encode WinAnsi only. Anything outside it would make
   drawText throw and lose the whole export, so text is folded into range first
   and the user is told once that it happened. */
const WIN_EXTRA = new Set([0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178]);
/* The Symbol font covers Greek and the common maths operators, so a run made of
   those can still be written faithfully instead of becoming question marks. */
const SYMBOLIC = /[\u0370-\u03FF\u2190-\u22FF\u2032\u2033\u2212\u00B5]/;
const WIN_FOLD = {
  '→': '->', '←': '<-', '⇒': '=>', '⇐': '<=', '↔': '<->', '•': '•',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '−': '-', '‑': '-', '‒': '–',
  '″': '"', '′': "'", '…': '…', ' ': ' ', ' ': ' ', ' ': ' ', '\t': '    '
};
function toWinAnsi(str) {
  let changed = false, out = '';
  for (const ch of String(str)) {
    if (WIN_FOLD[ch] !== undefined) { out += WIN_FOLD[ch]; if (WIN_FOLD[ch] !== ch) changed = true; continue; }
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff && c !== 0xad) || WIN_EXTRA.has(c) || ch === '\n') out += ch;
    else { out += '?'; changed = true; }
  }
  return { text: out, changed };
}

/* Can this standard font actually encode every character of the string? */
let MET_DOC = null; const MET = {};
async function stdFont(name) {
  if (!MET_DOC) MET_DOC = await PDFDocument.create();
  if (!MET[name]) MET[name] = await MET_DOC.embedFont(StandardFonts[name] || StandardFonts.Helvetica);
  return MET[name];
}

function canWrite(font, text) {
  try { font.widthOfTextAtSize(String(text), 12); return true; } catch (e) { return false; }
}

/* Colour adjustments live as a CSS filter while you work; they have to be drawn
   into the pixels before the image goes into the PDF. */
async function bakeImage(a) {
  const bytes = a.bytes instanceof Uint8Array ? a.bytes : new Uint8Array(a.bytes);
  const f = a.filter;
  const plain = !f || (f.b === 100 && f.c === 100 && f.s === 100 && f.g === 0);
  if (plain) return { bytes, fmt: a.fmt };
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = a.url; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d');
    c.filter = `brightness(${f.b}%) contrast(${f.c}%) saturate(${f.s}%) grayscale(${f.g}%)`;
    c.drawImage(img, 0, 0);
    const png = a.fmt === 'png';
    const blob = await toBlobOrThrow(cv, png ? 'image/png' : 'image/jpeg', 0.92);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), fmt: png ? 'png' : 'jpg' };
  } catch (e) { return { bytes, fmt: a.fmt }; }
}

/* Break text to a width without rewriting it. Splitting on /\s+/ and rejoining
   with a single space turned every run of spaces into one — a line the user had
   indented, or columns they had lined up by eye, came back closed up. Keeping
   the separators means what goes in is what comes out, bar the breaks. */
function wrapText(text, font, size, maxW) {
  const out = [];
  const width = probe => {
    try { return font.widthOfTextAtSize(probe, size); } catch (e) { return probe.length * size * 0.5; }
  };
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const piece of para.split(/(\s+)/)) {
      if (!piece) continue;
      // a run of spaces never forces a break; it rides on the end of the line
      if (/^\s+$/.test(piece)) { line += piece; continue; }
      if (line && width(line + piece) > maxW) { out.push(line); line = piece; }
      else line += piece;
    }
    out.push(line);
  }
  return out;
}

function outName(name, suffix, ext) {
  const base = String(name || 'document').replace(/\.[a-z0-9]+$/i, '');
  return base + suffix + (ext || '.pdf');
}

async function loadImageFile(file) {
  const bytes = await readFile(file);
  const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
  const blob = new Blob([bytes], { type: file.type || (isPng ? 'image/png' : 'image/jpeg') });
  const url = URL.createObjectURL(blob);
  const im = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
  });
  const isJpg = /jpe?g$/i.test(file.name) || file.type === 'image/jpeg';

  /* JPEG goes in untouched — the writer only reads its header. Everything else
     is redrawn through a canvas first. That covers WebP, which the writer
     cannot read at all, and PNG, where its decoder can spin for ever on a
     perfectly ordinary file: a plain 8-bit RGBA PNG of 118 bytes locks it up
     solid, in Node as well as in a browser, with no error to catch. A PNG the
     canvas has re-encoded is one it handles. */
  if (isJpg) return { url, bytes, fmt: 'jpg', w: im.naturalWidth, h: im.naturalHeight };

  const cv = h('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  cv.getContext('2d').drawImage(im, 0, 0);
  const keepAlpha = isPng || /\.(gif|webp)$/i.test(file.name) || /image\/(png|gif|webp)/.test(file.type || '');
  const out = await toBlobOrThrow(cv, keepAlpha ? 'image/png' : 'image/jpeg', 0.92);
  return {
    url: URL.createObjectURL(out),
    bytes: new Uint8Array(await out.arrayBuffer()),
    fmt: keepAlpha ? 'png' : 'jpg',
    w: im.naturalWidth, h: im.naturalHeight
  };
}

function trimCanvas(cv) {
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0, found = false;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (d[(y * cv.width + x) * 4 + 3] > 8) { found = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (!found) return cv;
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(cv.width, x1 + pad); y1 = Math.min(cv.height, y1 + pad);
  const o = document.createElement('canvas');
  o.width = x1 - x0; o.height = y1 - y0;
  o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

/* =============================================================== ORGANIZE */
function mountOrganize() {
  if (!S.doc) return needDoc('Open a PDF to reorganise', null, async files => {
    if (await openPdfFile(files[0])) mountOrganize();
  });

  let items = S.doc.pages.map(p => ({ key: uid(), src: p.n - 1, rot: 0, on: false, w: p.w, h: p.h }));
  /* One export at a time. Clicking Save twice used to start a second write over
     the first, and whichever finished last offered its file under the other
     one's name. */
  let busy = false;
  const stage = $('#wb-stage');
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const acts = $('#wb-actions');

  acts.append(
    h('button', { class: 'btn', onclick: () => exportPages(items.filter(i => i.on).length ? items.filter(i => i.on) : items, true) }, 'Extract selection'),
    h('button', { class: 'btn primary', onclick: () => exportPages(items, false) }, ico('save'), 'Save PDF')
  );

  function sidePanel() {
    clear(side);
    const n = items.filter(i => i.on).length;
    side.append(h('div', { class: 'pane-h' }, 'Page operations'));
    side.append(h('p', { style: 'font-size:13px;color:var(--ink-2);margin-bottom:14px' },
      'Hover a page for its controls. Select pages to act on several at once.'));
    side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2);margin-bottom:12px' },
      `${items.length} pages · ${n} selected`));
    const bulk = [
      ['Rotate left', 'rotl', () => bulkRot(-90)],
      ['Rotate right', 'rotr', () => bulkRot(90)],
      ['Duplicate', 'copy', () => bulkDup()],
      ['Delete', 'trash', () => bulkDel()]
    ];
    for (const [label, icn, fn] of bulk) {
      side.append(h('button', {
        class: 'btn sm' + (label === 'Delete' ? ' danger' : ''), style: 'width:100%;justify-content:flex-start;margin-bottom:6px',
        onclick: fn, disabled: !n
      }, ico(icn), label + (n ? ` (${n})` : '')));
    }
    side.append(h('button', { class: 'btn sm ghost', style: 'width:100%;justify-content:center;margin-top:8px', onclick: () => { const all = items.every(i => i.on); items.forEach(i => i.on = !all); draw(); } }, 'Select all / none'));
  }

  const bulkRot = d => { items.filter(i => i.on).forEach(i => i.rot = (i.rot + d + 360) % 360); draw(); };
  const bulkDup = () => {
    const next = [];
    for (const i of items) { next.push(i); if (i.on) next.push(Object.assign({}, i, { key: uid(), on: false })); }
    items = next; draw();
  };
  const bulkDel = () => {
    if (items.every(i => i.on)) { toast('At least one page has to stay.', true); return; }
    items = items.filter(i => !i.on); draw();
  };

  function draw() {
    clear(stage);
    const grid = h('div', { class: 'thumbs' });
    items.forEach((it, idx) => {
      const shot = h('div', { class: 'shot' });
      const cv = h('canvas');
      shot.append(cv);
      const card = h('div', { class: 'thumb' + (it.on ? ' on' : '') },
        shot,
        h('div', { class: 'ops' },
          btn('left', 'Move earlier', () => { if (idx > 0) { [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]]; draw(); } }),
          btn('rotl', 'Rotate left', () => { it.rot = (it.rot - 90 + 360) % 360; draw(); }),
          btn('rotr', 'Rotate right', () => { it.rot = (it.rot + 90) % 360; draw(); }),
          btn('trash', 'Delete', () => { if (items.length > 1) { items.splice(idx, 1); draw(); } else toast('At least one page has to stay.', true); }),
          btn('right', 'Move later', () => { if (idx < items.length - 1) { [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]]; draw(); } })
        ),
        h('span', { class: 'cap' }, `${idx + 1} · from p.${it.src + 1}${it.rot ? ' · ' + it.rot + '°' : ''}`)
      );
      card.addEventListener('click', e => {
        if (e.target.closest('.ops')) return;
        it.on = !it.on; draw();
      });
      grid.append(card);
      const rotated = it.rot % 180 !== 0;
      const scale = 118 / Math.max(it.w, it.h);
      shot.style.width = (rotated ? it.h : it.w) * scale + 'px';
      shot.style.height = (rotated ? it.w : it.h) * scale + 'px';
      cv.style.width = '100%'; cv.style.height = '100%';
      renderThumb(it, cv, scale);
    });
    stage.append(grid);
    sidePanel();
  }

  async function renderThumb(it, cv, scale) {
    try {
      const p = await S.doc.pdf.getPage(it.src + 1);
      const vp = p.getViewport({ scale: scale * 2, rotation: (p.rotate + it.rot) % 360 });
      cv.width = vp.width; cv.height = vp.height;
      await p.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    } catch (e) {}
  }

  function btn(icn, title, fn) {
    return h('button', { title, onclick: e => { e.stopPropagation(); fn(); } }, ico(icn));
  }

  async function exportPages(list, isExtract) {
    if (busy) { toast('Still writing the last one.', true); return; }
    busy = true;
    /* Take the order and the rotations now. Reading them back after the awaits
       meant a page rotated or deleted while the file was being written went
       into it — or, worse, the index no longer matched and a different page
       came out turned on its side. */
    const plan = list.map(i => ({ src: i.src, rot: i.rot }));
    progress(0.1);
    try {
      const src = await PDFDocument.load(S.doc.bytes.slice(0), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, plan.map(i => i.src));
      copied.forEach((pg, i) => {
        const base = ((pg.getRotation().angle % 360) + 360) % 360;
        pg.setRotation(degrees((base + plan[i].rot + 360) % 360));
        out.addPage(pg);
      });
      const bytes = await out.save();
      progress(1);
      await offerFile(outName(S.doc.name, isExtract ? '-extract' : '-organized'), bytes);
      offerContinue(bytes, outName(S.doc.name, isExtract ? '-extract' : '-organized'));
    } catch (e) {
      toast('Could not write the PDF: ' + (e.message || 'unknown error'), true);
    } finally { busy = false; setTimeout(() => progress(null), 400); }
  }

  draw();
}

/* Offer to keep working on a produced file inside the app. */
function offerContinue(bytes, name) {
  toast('Tip: use “Keep working on it” to chain another tool');
  const acts = $('#wb-actions');
  /* The button used to be added once and then skipped, so after a second
     export it still carried the FIRST file's bytes — a whole document held for
     the life of the tab, and the wrong one offered if it was ever clicked.
     Replace it, and let go of the bytes the moment they are used or the tool is
     left. */
  const old = acts.querySelector('[data-cont]');
  if (old) old.remove();
  let held = bytes;
  const btn = h('button', {
    class: 'btn sm', 'data-cont': '1', onclick: async () => {
      const b = held;
      held = null;
      btn.remove();
      if (!b) return;
      await setDoc(new Uint8Array(b), name);
      updateMeta();
      mount(S.tool);
      toast('Now working on ' + name);
    }
  }, 'Keep working on it');
  acts.prepend(btn);
  onCleanup(() => { held = null; });
}

/* ================================================================== MERGE */
function mountMerge() {
  const stage = $('#wb-stage');
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const acts = $('#wb-actions');
  let files = [];
  let busy = false;

  if (S.doc) files.push({ key: uid(), name: S.doc.name, bytes: S.doc.bytes, kind: 'pdf', size: S.doc.bytes.length });
  /* Images picked here hold blob URLs; they belong to this mount and nothing
     else, so they go when the tool does. */
  onCleanup(() => { for (const f of files) if (f.img && f.img.url) { try { URL.revokeObjectURL(f.img.url); } catch (e) {} } });

  acts.append(
    h('button', { class: 'btn', onclick: add }, ico('plus'), 'Add files'),
    h('button', { class: 'btn primary', onclick: run }, ico('save'), 'Merge & save')
  );

  async function add() {
    const picked = await pickFile('.pdf,image/png,image/jpeg,image/webp', true);
    if (picked && picked.length) await intake(picked);
  }

  async function intake(list) {
    for (const f of list) {
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      try {
        if (isPdf) files.push({ key: uid(), name: f.name, bytes: await readFile(f), kind: 'pdf', size: f.size });
        else files.push({ key: uid(), name: f.name, img: await loadImageFile(f), kind: 'img', size: f.size });
      } catch (e) { toast('Skipped ' + f.name, true); }
    }
    draw();
  }

  function draw() {
    clear(stage);
    if (!files.length) {
      const zone = dropTarget(h('div', { class: 'drop' },
        h('div', { class: 'big' }, 'Drop the files to combine'),
        h('div', { class: 'sub' }, 'PDFs and images, in any mix. You set the order next.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: add }, ico('plus'), 'Add files'))
      ), intake);
      stage.append(h('div', { class: 'empty' }, h('div', { class: 'inner' }, zone)));
    } else {
      const list = h('div', { class: 'flist' });
      files.forEach((f, i) => {
        list.append(h('div', { class: 'frow' },
          ico(f.kind === 'pdf' ? 'file' : 'image'),
          h('span', { class: 'nm' }, f.name),
          h('span', { class: 'sz' }, fmtBytes(f.size)),
          h('span', { class: 'mv' },
            h('button', { title: 'Move up', onclick: () => { if (i > 0) { [files[i - 1], files[i]] = [files[i], files[i - 1]]; draw(); } } }, ico('up')),
            h('button', { title: 'Move down', onclick: () => { if (i < files.length - 1) { [files[i + 1], files[i]] = [files[i], files[i + 1]]; draw(); } } }, ico('down')),
            h('button', { title: 'Remove', onclick: () => { files.splice(i, 1); draw(); } }, ico('trash'))
          )
        ));
      });
      list.append(h('button', { class: 'btn sm', style: 'justify-self:start', onclick: add }, ico('plus'), 'Add more'));
      dropTarget(list, intake);
      stage.append(list);
    }
    clear(side).append(
      h('div', { class: 'pane-h' }, 'Merge'),
      h('p', { style: 'font-size:13px;color:var(--ink-2)' }, 'Files are combined top to bottom. A PDF contributes all of its pages; an image becomes one page at its own size.'),
      h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2);margin-top:14px' },
        `${files.length} file${files.length === 1 ? '' : 's'} · ${fmtBytes(files.reduce((a, f) => a + f.size, 0))} in`)
    );
  }

  async function run() {
    if (busy) { toast('Still merging.', true); return; }
    if (files.length < 2) { toast('Add at least two files to merge.', true); return; }
    busy = true;
    const plan = files.slice();          // the order as it is now, not as it ends up
    progress(0.05);
    try {
      const out = await PDFDocument.create();
      /* One bad file in a batch of twenty used to throw and lose the other
         nineteen. Skip what cannot be read, say which, and merge the rest —
         and name an encrypted file as encrypted rather than letting
         ignoreEncryption hand back a document whose pages will not copy. */
      const skipped = [];
      for (let i = 0; i < plan.length; i++) {
        const f = plan[i];
        try {
          if (f.kind === 'pdf') {
            const src = await PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: true });
            if (src.isEncrypted) { skipped.push(f.name + ' (password-protected)'); continue; }
            const pages = await out.copyPages(src, src.getPageIndices());
            pages.forEach(p => out.addPage(p));
          } else {
            const emb = f.img.fmt === 'png' ? await out.embedPng(f.img.bytes) : await out.embedJpg(f.img.bytes);
            const pg = out.addPage([emb.width, emb.height]);
            pg.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
          }
        } catch (e) {
          console.error('merge: skipped ' + f.name, e);
          skipped.push(f.name);
        }
        progress(0.05 + 0.9 * ((i + 1) / plan.length));
      }
      if (!out.getPageCount()) throw new Error('none of those files could be read');
      const bytes = await out.save();
      progress(1);
      if (skipped.length) {
        toast('Skipped ' + skipped.slice(0, 3).join(', ') +
          (skipped.length > 3 ? ` and ${skipped.length - 3} more` : '') + '.', true);
      }
      await offerFile('merged.pdf', bytes);
      offerContinue(bytes, 'merged.pdf');
    } catch (e) {
      toast('Merge failed: ' + (e.message || 'unknown error'), true);
    } finally { busy = false; setTimeout(() => progress(null), 400); }
  }

  draw();
}

/* How many separate files one batch may produce. The pieces are all held until
   the zip is written, so this is a memory bound, not a taste one. */
const MAX_PARTS = 150;

/* ================================================================== SPLIT */
/* Returns {ranges, bad} — the ranges that make sense, and the pieces of the
   spec that do not. Clamping silently was the wrong answer: typing 5-90 on a
   nine-page document produced "pages 5-9" with no hint that the 90 had been
   quietly adjusted, and a typo like "1-3, 7x" simply dropped the 7x. */
function parseRanges(spec, total) {
  const out = [];
  const bad = [];
  for (const chunk of String(spec).split(',')) {
    const t = chunk.trim();
    if (!t) continue;
    let m;
    const ok = (a, b) => {
      if (a < 1 || b < 1 || a > total || b > total) { bad.push(t); return; }
      out.push({ from: Math.min(a, b), to: Math.max(a, b) });
    };
    if ((m = t.match(/^(\d+)\s*-\s*(\d+)$/))) ok(+m[1], +m[2]);
    else if ((m = t.match(/^(\d+)\s*-$/))) ok(+m[1], total);
    else if ((m = t.match(/^-\s*(\d+)$/))) ok(1, +m[1]);
    else if ((m = t.match(/^\d+$/))) ok(+t, +t);
    else bad.push(t);
  }
  out.ranges = out;
  out.bad = bad;
  return out;
}

function mountSplit() {
  if (!S.doc) return needDoc('Open a PDF to split', null, async files => {
    if (await openPdfFile(files[0])) mountSplit();
  });
  const total = S.doc.pages.length;
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const stage = $('#wb-stage');
  let mode = 'ranges';
  const fmtR = (a, b) => (a === b ? String(a) : a + '-' + b);
  const mid = Math.ceil(total / 2);
  let spec = total === 1 ? '1' : fmtR(1, mid) + ', ' + fmtR(mid + 1, total);
  let every = 1;
  let busy = false;

  $('#wb-actions').append(h('button', { class: 'btn primary', onclick: run }, ico('save'), 'Split & save'));

  function panel() {
    clear(side);
    side.append(h('div', { class: 'pane-h' }, 'Split by'));
    const seg = h('div', { class: 'seg' },
      h('button', { 'aria-pressed': mode === 'ranges', onclick: () => { mode = 'ranges'; panel(); preview(); } }, 'Ranges'),
      h('button', { 'aria-pressed': mode === 'every', onclick: () => { mode = 'every'; panel(); preview(); } }, 'Every N')
    );
    side.append(h('div', { class: 'field' }, seg));
    if (mode === 'ranges') {
      side.append(h('div', { class: 'field' },
        h('label', { for: 'sp-spec' }, 'Page ranges'),
        h('input', { type: 'text', id: 'sp-spec', value: spec, oninput: e => { spec = e.target.value; preview(); } }),
        h('span', { class: 'hint' }, 'Use commas: 1-3, 7, 12-. Each range becomes one file.')
      ));
    } else {
      side.append(h('div', { class: 'field' },
        h('label', { for: 'sp-every' }, 'Pages per file'),
        h('input', { type: 'number', id: 'sp-every', min: 1, max: total, value: every, oninput: e => { every = clamp(+e.target.value || 1, 1, total); preview(); } })
      ));
    }
    side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2)' }, `Source: ${total} pages`));
  }

  function ranges() {
    if (mode === 'every') {
      const out = [];
      for (let i = 1; i <= total; i += every) out.push({ from: i, to: Math.min(total, i + every - 1) });
      return out;
    }
    return parseRanges(spec, total);
  }

  /* This used to end by calling panel(), which rebuilds the side panel — and
     therefore the very input being typed into. Every keystroke replaced the
     field, so the caret jumped to the end and a selection was lost. The panel
     is rebuilt only when the mode changes now; preview touches the stage. */
  function preview() {
    const rs = ranges();
    const bad = rs.bad || [];
    clear(stage);
    const wrap = h('div', { class: 'flist' });
    if (bad.length) {
      wrap.append(h('p', { style: 'color:var(--mark);font-size:13px' },
        (bad.length === 1 ? 'This part is not a page range on a ' : 'These parts are not page ranges on a ') +
        total + '-page document: ' + bad.join(', ') + '.'));
    }
    if (!rs.length) {
      wrap.append(h('p', { style: 'color:var(--ink-2);font-size:13.5px' }, 'No valid ranges yet. Try something like 1-3, 5.'));
    } else {
      rs.forEach((r, i) => wrap.append(h('div', { class: 'frow' },
        ico('file'),
        h('span', { class: 'nm' }, outName(S.doc.name, '-' + (i + 1))),
        h('span', { class: 'sz' }, r.from === r.to ? 'page ' + r.from : `pages ${r.from}–${r.to}`)
      )));
      wrap.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-3)' },
        rs.length === 1 ? 'Saves as one PDF' : `Saves as a zip of ${rs.length} PDFs`));
    }
    stage.append(wrap);
  }

  async function run() {
    if (busy) { toast('Still splitting.', true); return; }
    const rs = ranges();
    if (!rs.length) { toast('Enter at least one valid range.', true); return; }
    /* Every piece is held in memory until the zip is built, so a request for
       hundreds of files is a request to run the tab out of memory. */
    if (rs.length > MAX_PARTS) {
      toast(`That is ${rs.length} separate files — more than this can hold in memory at once. Split it in batches of ${MAX_PARTS} or fewer.`, true);
      return;
    }
    busy = true;
    progress(0.05);
    try {
      const src = await PDFDocument.load(S.doc.bytes.slice(0), { ignoreEncryption: true });
      const made = [];
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        const out = await PDFDocument.create();
        const idx = [];
        for (let p = r.from; p <= r.to; p++) idx.push(p - 1);
        const pages = await out.copyPages(src, idx);
        pages.forEach(p => out.addPage(p));
        made.push({ name: outName(S.doc.name, '-' + (i + 1)), bytes: await out.save() });
        progress(0.05 + 0.85 * ((i + 1) / rs.length));
      }
      if (made.length === 1) {
        await offerFile(made[0].name, made[0].bytes);
      } else {
        const zip = new window.JSZip();
        made.forEach(m => zip.file(m.name, m.bytes));
        const blob = await zip.generateAsync({ type: 'blob' });
        await offerFile(outName(S.doc.name, '-split', '.zip'), blob);
      }
      progress(1);
    } catch (e) {
      toast('Split failed: ' + (e.message || 'unknown error'), true);
    } finally { busy = false; setTimeout(() => progress(null), 400); }
  }

  panel();
  preview();
}

/* ========================================================== PDF → IMAGES */
function mountToImages() {
  if (!S.doc) return needDoc('Open a PDF to convert', null, async files => {
    if (await openPdfFile(files[0])) mountToImages();
  });
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const stage = $('#wb-stage');
  let dpi = 150, fmt = 'png', quality = 0.9, busy = false;

  $('#wb-actions').append(h('button', { class: 'btn primary', onclick: run }, ico('save'), 'Render & save'));

  function panel() {
    clear(side);
    side.append(h('div', { class: 'pane-h' }, 'Output'));
    side.append(h('div', { class: 'field' }, h('label', null, 'Format'),
      h('div', { class: 'seg' },
        h('button', { 'aria-pressed': fmt === 'png', onclick: () => { fmt = 'png'; panel(); } }, 'PNG'),
        h('button', { 'aria-pressed': fmt === 'jpeg', onclick: () => { fmt = 'jpeg'; panel(); } }, 'JPEG'))));
    side.append(h('div', { class: 'field' }, h('label', { for: 'ti-dpi' }, 'Resolution'),
      h('select', { id: 'ti-dpi', onchange: e => { dpi = +e.target.value; panel(); } },
        ...[72, 110, 150, 200, 300].map(d => h('option', { value: d, selected: dpi === d }, d + ' DPI' + (d === 150 ? ' — good default' : d === 300 ? ' — print' : d === 72 ? ' — screen' : ''))))));
    if (fmt === 'jpeg') {
      const out = h('span', { class: 'val' }, Math.round(quality * 100) + '%');
      side.append(h('div', { class: 'field' }, h('label', null, 'JPEG quality'),
        h('div', { class: 'rangerow' },
          h('input', { type: 'range', min: 40, max: 100, value: quality * 100, oninput: e => { quality = +e.target.value / 100; out.textContent = e.target.value + '%'; } }), out)));
    }
    const p0 = S.doc.pages[0];
    const px = Math.round(p0.w * dpi / 72), py = Math.round(p0.h * dpi / 72);
    side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2)' },
      `${S.doc.pages.length} page${S.doc.pages.length === 1 ? '' : 's'} · page 1 renders at ${px}×${py} px`));
    side.append(h('p', { style: 'font-size:12px;color:var(--ink-3);margin-top:10px' },
      S.doc.pages.length > 1 ? 'Several pages are bundled into one zip.' : 'A single page saves as one image.'));
  }

  async function run() {
    if (busy) { toast('Still rendering.', true); return; }
    const count = S.doc.pages.length;
    /* Every page's image is held until the zip is written. At 300 dpi an A4
       page is about 1 MB as PNG, so a long document asked for more than the tab
       has — and it failed with nothing to show for the wait. */
    if (count > MAX_PARTS) {
      toast(`${count} pages at once is more than this can hold in memory. Use Split first, or render in batches of ${MAX_PARTS}.`, true);
      return;
    }
    busy = true;
    const mine = ownsScreen();
    progress(0.02);
    try {
      const scale = dpi / 72;
      const made = [];
      for (let i = 1; i <= count; i++) {
        const cv = document.createElement('canvas');
        const p = await S.doc.pdf.getPage(i);
        if (!mine()) return;
        const vp = p.getViewport({ scale });
        cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
        const ctx = cv.getContext('2d');
        if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await toBlobOrThrow(cv, 'image/' + fmt, fmt === 'jpeg' ? quality : undefined);
        made.push({ name: outName(S.doc.name, '-p' + String(i).padStart(2, '0'), fmt === 'png' ? '.png' : '.jpg'), blob });
        /* let the canvas go now rather than at the end of the loop */
        cv.width = cv.height = 0;
        progress(0.02 + 0.9 * (i / count));
      }
      if (made.length === 1) await offerFile(made[0].name, made[0].blob);
      else {
        const zip = new window.JSZip();
        for (const m of made) zip.file(m.name, m.blob);
        const blob = await zip.generateAsync({ type: 'blob' });
        await offerFile(outName(S.doc.name, '-images', '.zip'), blob);
      }
      progress(1);
    } catch (e) {
      toast('Render failed: ' + (e.message || 'unknown error'), true);
    } finally { busy = false; setTimeout(() => progress(null), 400); }
  }

  const stageNote = h('div', { class: 'empty' }, h('div', { class: 'inner' },
    ico('image'),
    h('h3', null, 'Ready to render'),
    h('p', null, 'Pages are rasterised one at a time on this device. Set the format and resolution on the right, then save.')
  ));
  clear(stage).append(stageNote);
  panel();
}

/* ========================================================== IMAGES → PDF */
const PAGE_SIZES = { fit: null, a4: [595.28, 841.89], letter: [612, 792] };

function mountFromImages() {
  const stage = $('#wb-stage');
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  let imgs = [];
  let size = 'fit', margin = 0, busy = false;
  /* Each picture added here holds a blob URL for its thumbnail; they belong to
     this mount, so they go when it does. */
  onCleanup(() => { for (const it of imgs) if (it.img && it.img.url) { try { URL.revokeObjectURL(it.img.url); } catch (e) {} } });

  $('#wb-actions').append(
    h('button', { class: 'btn', onclick: add }, ico('plus'), 'Add images'),
    h('button', { class: 'btn primary', onclick: run }, ico('save'), 'Build PDF')
  );

  async function add() {
    const picked = await pickFile('image/png,image/jpeg,image/webp', true);
    if (picked && picked.length) await intake(picked);
  }
  async function intake(list) {
    for (const f of list) {
      if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) { toast('Skipped ' + f.name, true); continue; }
      try { imgs.push({ key: uid(), name: f.name, size: f.size, img: await loadImageFile(f) }); }
      catch (e) { toast('Could not read ' + f.name, true); }
    }
    draw();
  }

  function draw() {
    clear(stage);
    if (!imgs.length) {
      const zone = dropTarget(h('div', { class: 'drop' },
        h('div', { class: 'big' }, 'Drop images here'),
        h('div', { class: 'sub' }, 'JPG, PNG or WebP. Each becomes a page, in the order shown.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: add }, ico('plus'), 'Add images'))
      ), intake);
      stage.append(h('div', { class: 'empty' }, h('div', { class: 'inner' }, zone)));
    } else {
      const grid = h('div', { class: 'thumbs' });
      imgs.forEach((it, i) => {
        const shot = h('div', { class: 'shot' }, h('img', { src: it.img.url, alt: '', style: 'display:block;max-width:118px;max-height:118px' }));
        grid.append(h('div', { class: 'thumb' }, shot,
          h('div', { class: 'ops' },
            h('button', { title: 'Move earlier', onclick: () => { if (i > 0) { [imgs[i - 1], imgs[i]] = [imgs[i], imgs[i - 1]]; draw(); } } }, ico('left')),
            h('button', { title: 'Remove', onclick: () => {
              const [gone] = imgs.splice(i, 1);
              if (gone && gone.img && gone.img.url) { try { URL.revokeObjectURL(gone.img.url); } catch (e) {} }
              draw();
            } }, ico('trash')),
            h('button', { title: 'Move later', onclick: () => { if (i < imgs.length - 1) { [imgs[i + 1], imgs[i]] = [imgs[i], imgs[i + 1]]; draw(); } } }, ico('right'))),
          h('span', { class: 'cap' }, `${i + 1} · ${it.img.w}×${it.img.h}`)));
      });
      dropTarget(grid, intake);
      stage.append(grid);
    }
    panel();
  }

  function panel() {
    clear(side);
    side.append(h('div', { class: 'pane-h' }, 'Page setup'));
    side.append(h('div', { class: 'field' }, h('label', { for: 'fi-size' }, 'Page size'),
      h('select', { id: 'fi-size', onchange: e => { size = e.target.value; panel(); } },
        h('option', { value: 'fit', selected: size === 'fit' }, 'Fit each image'),
        h('option', { value: 'a4', selected: size === 'a4' }, 'A4 (210 × 297 mm)'),
        h('option', { value: 'letter', selected: size === 'letter' }, 'Letter (8.5 × 11 in)'))));
    if (size !== 'fit') {
      const out = h('span', { class: 'val' }, margin + ' pt');
      side.append(h('div', { class: 'field' }, h('label', null, 'Margin'),
        h('div', { class: 'rangerow' },
          h('input', { type: 'range', min: 0, max: 72, value: margin, oninput: e => { margin = +e.target.value; out.textContent = margin + ' pt'; } }), out),
        h('span', { class: 'hint' }, 'Orientation follows each image.')));
    }
    side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2)' },
      `${imgs.length} image${imgs.length === 1 ? '' : 's'} · ${fmtBytes(imgs.reduce((a, i) => a + i.size, 0))}`));
  }

  async function run() {
    if (busy) { toast('Still building.', true); return; }
    if (!imgs.length) { toast('Add at least one image.', true); return; }
    busy = true;
    // the list as it is now: adding or removing a picture mid-build is not it
    const plan = imgs.slice();
    progress(0.05);
    try {
      const out = await PDFDocument.create();
      for (let i = 0; i < plan.length; i++) {
        const im = plan[i].img;
        const emb = im.fmt === 'png' ? await out.embedPng(im.bytes) : await out.embedJpg(im.bytes);
        if (size === 'fit') {
          const pg = out.addPage([emb.width, emb.height]);
          pg.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
        } else {
          let [pw, ph] = PAGE_SIZES[size];
          if (emb.width > emb.height) [pw, ph] = [ph, pw];
          const pg = out.addPage([pw, ph]);
          const availW = pw - margin * 2, availH = ph - margin * 2;
          const k = Math.min(availW / emb.width, availH / emb.height);
          const w = emb.width * k, hh = emb.height * k;
          pg.drawImage(emb, { x: (pw - w) / 2, y: (ph - hh) / 2, width: w, height: hh });
        }
        progress(0.05 + 0.9 * ((i + 1) / plan.length));
      }
      const bytes = await out.save();
      progress(1);
      await offerFile('images.pdf', bytes);
      offerContinue(bytes, 'images.pdf');
    } catch (e) {
      toast('Could not build the PDF: ' + (e.message || 'unknown error'), true);
    } finally { busy = false; setTimeout(() => progress(null), 400); }
  }

  draw();
}

/* =============================================================== COMPRESS */
function mountCompress() {
  if (!S.doc) return needDoc('Open a PDF to compress', null, async files => {
    if (await openPdfFile(files[0])) mountCompress();
  });
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const stage = $('#wb-stage');
  let dpi = 110, quality = 0.62, busy = false;

  $('#wb-actions').append(h('button', { class: 'btn primary', onclick: run }, ico('save'), 'Compress & save'));

  function panel() {
    clear(side);
    side.append(h('div', { class: 'pane-h' }, 'Compression'));
    side.append(h('div', { class: 'field' }, h('label', { for: 'cp-dpi' }, 'Rasterise at'),
      h('select', { id: 'cp-dpi', onchange: e => { dpi = +e.target.value; panel(); } },
        ...[72, 96, 110, 150, 200].map(d => h('option', { value: d, selected: dpi === d }, d + ' DPI')))));
    const out = h('span', { class: 'val' }, Math.round(quality * 100) + '%');
    side.append(h('div', { class: 'field' }, h('label', null, 'JPEG quality'),
      h('div', { class: 'rangerow' },
        h('input', { type: 'range', min: 30, max: 92, value: quality * 100, oninput: e => { quality = +e.target.value / 100; out.textContent = e.target.value + '%'; } }), out)));
    side.append(h('p', { style: 'font-size:12.5px;color:var(--ink-2)' },
      'Every page is re-rendered as a JPEG and the document is rebuilt around those images.'));
    side.append(h('p', { style: 'font-size:12.5px;color:var(--mark);margin-top:10px' },
      'Text stops being selectable or searchable. On a document that is mostly text this can make the file larger — you will see the figures before you save.'));
    side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2);margin-top:12px' },
      `Now: ${fmtBytes(S.doc.bytes.length)} · ${S.doc.pages.length} pages`));
  }

  async function run() {
    if (busy) { toast('Still compressing.', true); return; }
    busy = true;
    const mine = ownsScreen();
    progress(0.02);
    try {
      const out = await PDFDocument.create();
      const scale = dpi / 72;
      for (let i = 1; i <= S.doc.pages.length; i++) {
        if (!mine()) return;
        const p = await S.doc.pdf.getPage(i);
        const vp = p.getViewport({ scale });
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await toBlobOrThrow(cv, 'image/jpeg', quality);
        const emb = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const base = p.getViewport({ scale: 1 });
        const pg = out.addPage([base.width, base.height]);
        pg.drawImage(emb, { x: 0, y: 0, width: base.width, height: base.height });
        progress(0.02 + 0.9 * (i / S.doc.pages.length));
      }
      const bytes = await out.save();
      progress(1);
      showResult(bytes);
    } catch (e) {
      toast('Compression failed: ' + (e.message || 'unknown error'), true);
    } finally { busy = false; setTimeout(() => progress(null), 400); }
  }

  function showResult(bytes) {
    const before = S.doc.bytes.length, after = bytes.length;
    const pct = Math.round((1 - after / before) * 100);
    const name = outName(S.doc.name, '-compressed');
    clear(stage).append(h('div', { class: 'result' },
      h('span', { class: 'tick' }, ico('check')),
      h('h3', null, pct > 0 ? `${pct}% smaller` : 'This file got bigger'),
      h('p', { class: 'stat' }, `${fmtBytes(before)} → ${fmtBytes(after)} at ${dpi} DPI, quality ${Math.round(quality * 100)}%`),
      pct <= 0 ? h('p', { style: 'font-size:13px;color:var(--ink-2)' },
        'That means the original was efficient text rather than scanned images. Rasterising it adds bytes instead of saving them — keep the original, or try a lower DPI.') : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => offerFile(name, bytes) }, ico('save'), 'Save ' + name),
        h('button', { class: 'btn', onclick: () => { panel(); clear(stage).append(note()); } }, 'Try other settings'))
    ));
  }

  const note = () => h('div', { class: 'empty' }, h('div', { class: 'inner' },
    ico('zip'),
    h('h3', null, 'Set the trade-off'),
    h('p', null, 'Lower DPI and quality shrink the file and soften the page. The result is measured before anything is saved.')
  ));

  clear(stage).append(note());
  panel();
}

/* ============================================================ TEXT EXTRACT */
/* ========================================================= PDF → Word (.docx)

   A .docx is a zip of XML parts, so none of this needs a server: pdf.js hands
   over every glyph with its position, size and face; those are rebuilt into
   lines, lines into paragraphs, and the paragraphs written out as
   WordprocessingML. Two shapes come out of it — a flowing document that edits
   like anything typed in Word, or a page-faithful one where every block is
   pinned in place with w:framePr. */

const EMU_PT = 12700;   // EMUs per point
const TW_PT = 20;       // twentieths of a point ("twips") per point

function xmlEsc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

/* The face a PDF names is usually a real family Word also has, so keep it and
   fall back to a metric-compatible standard only when it is unrecognisable. */
const WORD_FONTS = [
  [/calibri|carlito/i, 'Calibri'], [/cambria|caladea/i, 'Cambria'],
  [/arial|helvetica|liberation\s*sans|nimbus\s*sans|arimo|aptos/i, 'Arial'],
  [/times|liberation\s*serif|nimbus\s*roman|tinos/i, 'Times New Roman'],
  [/courier|liberation\s*mono|nimbus\s*mono|cousine/i, 'Courier New'],
  [/georgia/i, 'Georgia'], [/garamond/i, 'Garamond'], [/verdana|dejavu\s*sans(?!\s*mono)/i, 'Verdana'],
  [/tahoma/i, 'Tahoma'], [/trebuchet/i, 'Trebuchet MS'], [/palatino|book\s*antiqua/i, 'Book Antiqua'],
  [/consolas/i, 'Consolas'], [/segoe/i, 'Segoe UI'], [/roboto\s*mono/i, 'Roboto Mono'], [/roboto/i, 'Roboto'],
  [/lato/i, 'Lato'], [/open\s*sans/i, 'Open Sans'], [/montserrat/i, 'Montserrat'], [/poppins/i, 'Poppins'],
  [/merriweather/i, 'Merriweather'], [/noto\s*serif/i, 'Noto Serif'], [/noto\s*sans/i, 'Noto Sans'],
  [/source\s*sans/i, 'Source Sans Pro'], [/source\s*serif/i, 'Source Serif Pro'],
  [/minion/i, 'Minion Pro'], [/myriad/i, 'Myriad Pro'], [/futura/i, 'Futura'], [/gill\s*sans/i, 'Gill Sans'],
  [/baskerville/i, 'Baskerville'], [/caslon/i, 'Caslon'], [/bookman/i, 'Bookman Old Style'],
  [/century/i, 'Century Schoolbook'], [/franklin/i, 'Franklin Gothic'], [/optima/i, 'Optima'],
  [/rockwell/i, 'Rockwell'], [/lucida\s*console/i, 'Lucida Console'], [/lucida/i, 'Lucida Sans'],
  [/cambay|charter/i, 'Charter'], [/inter\b/i, 'Inter'], [/nunito/i, 'Nunito'], [/raleway/i, 'Raleway'],
  [/work\s*sans/i, 'Work Sans'], [/ibm\s*plex\s*mono/i, 'IBM Plex Mono'], [/ibm\s*plex/i, 'IBM Plex Sans']
];
function wordFont(face) {
  const n = String(face || '').replace(/^[A-Z]{6}\+/, '');
  for (const [re, fam] of WORD_FONTS) if (re.test(n)) return fam;
  const std = guessStdFont(n);
  return /Times/.test(std) ? 'Times New Roman' : /Courier/.test(std) ? 'Courier New' : 'Arial';
}

/* ---- rebuild lines, keeping every format change inside them ---- */
function wordLines(items, vp, page) {
  const raw = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const m = pdfjsLib.Util.transform(vp.transform, it.transform);
    const size = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]);
    if (!size || size < 2) continue;
    /* Drop text that is turned relative to the page, not text the PAGE turns.
       vp.transform has already applied /Rotate, so a 90-degree scan came
       through with every run at right angles to the x axis and the whole page
       was discarded as "rotated" — a document that read as empty. Compare
       against the dominant angle instead, which is worked out below. */
    const ang = Math.atan2(m[1], m[0]);
    let real = '';
    try { if (page.commonObjs.has(it.fontName)) real = page.commonObjs.get(it.fontName).name || ''; } catch (e) {}
    raw.push({ x: m[4], baseline: m[5], w: it.width || size * it.str.length * 0.5, size, str: it.str, face: real || it.fontName || '', ang });
  }
  /* The angle most of the characters on this page share is "upright" for this
     page; anything more than a few degrees off it is a rotated stamp or a
     sideways caption, and those are what the layout code cannot handle. */
  const tally = new Map();
  for (const r of raw) {
    const q = Math.round(r.ang / (Math.PI / 2)) * (Math.PI / 2);
    tally.set(q, (tally.get(q) || 0) + r.str.length);
  }
  let base = 0, bestN = -1;
  for (const [q, n] of tally) if (n > bestN) { bestN = n; base = q; }
  const kept = raw.filter(r => Math.abs(r.ang - base) < 0.08);
  raw.length = 0;
  raw.push(...kept);
  raw.sort((a, b) => (a.baseline - b.baseline) || (a.x - b.x));

  const lines = [];
  for (const r of raw) {
    const L = lines[lines.length - 1];
    const sameRow = L && Math.abs(L.baseline - r.baseline) < Math.max(1, L.size * 0.3);
    const gap = L ? r.x - (L.x + L.w) : 0;
    if (sameRow && gap > -L.size * 0.9 && gap < L.size * 2.2) {
      const last = L.segs[L.segs.length - 1];
      const space = gap > r.size * 0.17 && !/\s$/.test(last.str) && !/^\s/.test(r.str);
      if (last.face === r.face && Math.abs(last.size - r.size) < 0.4) last.str += (space ? ' ' : '') + r.str;
      else L.segs.push({ str: (space ? ' ' : '') + r.str, face: r.face, size: r.size });
      L.w = Math.max(L.w, (r.x + r.w) - L.x);
      L.weigh.set(r.size, (L.weigh.get(r.size) || 0) + r.str.length);
      L.faces.set(r.face, (L.faces.get(r.face) || 0) + r.str.length);
    } else {
      lines.push({
        x: r.x, baseline: r.baseline, w: r.w, size: r.size, face: r.face,
        segs: [{ str: r.str, face: r.face, size: r.size }],
        weigh: new Map([[r.size, r.str.length]]), faces: new Map([[r.face, r.str.length]])
      });
    }
  }
  for (const l of lines) {
    l.size = [...l.weigh.entries()].sort((a, b) => b[1] - a[1])[0][0];
    l.face = [...l.faces.entries()].sort((a, b) => b[1] - a[1])[0][0];
    l.str = l.segs.map(s => s.str).join('');
  }
  return lines.filter(l => l.str.trim().length);
}

/* ---- consecutive lines sharing face, size, left edge and leading ---- */
function wordBlocks(lines) {
  const out = [];
  for (const l of lines) {
    const b = out[out.length - 1];
    const gap = b ? l.baseline - b.lastBaseline : 0;
    const faceOk = b && b.face === l.face && Math.abs(b.size - l.size) < b.size * 0.2;
    const leadOk = b && gap > l.size * 0.75 && gap < l.size * 2.4;
    const leftOk = b && (Math.abs(l.x - b.x) < Math.max(2, l.size * 0.4) ||
      (b.lines.length === 1 && Math.abs(l.x - b.x) < l.size * 4));
    if (b && faceOk && leadOk && leftOk) {
      b.lines.push(l);
      b.lineH = b.lines.length === 2 ? gap : (b.lineH * (b.lines.length - 2) + gap) / (b.lines.length - 1);
      b.lastBaseline = l.baseline;
      b.right = Math.max(b.right, l.x + l.w);
      b.x = Math.min(b.x, l.x);
    } else {
      out.push({
        face: l.face, size: l.size, x: l.x, right: l.x + l.w, baseline: l.baseline,
        lastBaseline: l.baseline, lineH: l.size * 1.2, lines: [l]
      });
    }
  }
  for (const b of out) {
    const span = Math.max(1, b.right - b.x);
    const inner = b.lines.slice(0, -1).map(l => (l.x + l.w - b.x) / span);
    b.flow = inner.length > 0 && inner.every(f => f >= 0.82);
    b.y = b.baseline - b.size * 0.82;
    b.w = (b.right - b.x) + Math.max(1.5, b.size * 0.2);
    b.h = (b.lines.length - 1) * b.lineH + b.size * 1.14;
    b.str = b.lines.map(l => l.str.replace(/\s+$/, '')).join(' ');
  }
  return out;
}

/* ---- where the page draws pictures (exact: the CTM is replayed) ---- */
async function wordImageRects(page, vp) {
  const rects = [];
  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS, U = pdfjsLib.Util;
    let ctm = vp.transform.slice();
    const stack = [];
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i], args = ops.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || ctm;
      else if (fn === OPS.transform) ctm = U.transform(ctm, args);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject || fn === OPS.paintImageMaskXObject) {
        const c = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => U.applyTransform([x, y], ctm));
        const xs = c.map(q => q[0]), ys = c.map(q => q[1]);
        const r = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        if (r.w > 12 && r.h > 12 && r.w < vp.width * 1.5 && r.h < vp.height * 1.5) rects.push(r);
      }
    }
  } catch (e) { /* a page whose operators will not replay simply has no pictures */ }
  // drop rectangles swallowed by a larger one (tiles of the same photograph)
  return rects.filter((r, i) => !rects.some((o, j) => j !== i &&
    o.x <= r.x + 1 && o.y <= r.y + 1 && o.x + o.w >= r.x + r.w - 1 && o.y + o.h >= r.y + r.h - 1 &&
    (o.w * o.h) > (r.w * r.h)));
}

/* Antialiased black samples back as 010101 and the like; writing that into the
   file would mark every ordinary paragraph as coloured, so only a colour that
   is genuinely one survives. */
function wordColour(hex) {
  const h6 = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h6)) return null;
  const r = parseInt(h6.slice(0, 2), 16), g = parseInt(h6.slice(2, 4), 16), b = parseInt(h6.slice(4, 6), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max - min < 24 && max < 70) return null;     // black, however it sampled
  if (min > 225) return null;                      // white — the sample missed
  return h6.toUpperCase();
}

/* A page crop goes out as JPEG once it is big enough for the saving to matter,
   and PNG below that so logos and line art stay crisp. Either way it is laid on
   white first: a rendered page has no backdrop of its own. */
async function cropToImage(canvas, pgW, pgH, r) {
  /* Without this, a canvas that was never rendered gave sx = sy = 0, every
     dimension collapsed to Math.max(1, 0), and what went into the document was
     a 1×1 white pixel stretched to the full size of the picture. Better to
     return nothing and leave the picture out than to write a blank box over
     it. */
  if (!canvas || !canvas.width || !canvas.height || !(pgW > 0) || !(pgH > 0)) return null;
  const sx = canvas.width / pgW, sy = canvas.height / pgH;
  const w = Math.max(1, Math.round(r.w * sx)), h = Math.max(1, Math.round(r.h * sy));
  if (w < 2 || h < 2) return null;
  const cut = document.createElement('canvas');
  cut.width = w; cut.height = h;
  const cx = cut.getContext('2d');
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
  cx.drawImage(canvas, Math.round(r.x * sx), Math.round(r.y * sy),
    Math.round(r.w * sx), Math.round(r.h * sy), 0, 0, w, h);
  const big = w * h > 90000;
  try {
    const blob = await toBlobOrThrow(cut, big ? 'image/jpeg' : 'image/png', 0.86);
    return { blob, ext: big ? 'jpeg' : 'png' };
  } catch (e) {
    console.error('cropToImage', e);
    return null;
  }
}

/* ---- WordprocessingML fragments ---- */
function wRun(text, fmt) {
  const f = fmt.font;
  /* The children of w:rPr are a SEQUENCE in the schema, not a set: w:color
     comes before w:sz, and Word refuses to open a file that has them the other
     way round — it offers to repair it instead. LibreOffice does not mind,
     which is exactly why this went unnoticed. */
  const rPr = '<w:rPr>' +
    `<w:rFonts w:ascii="${xmlEsc(f)}" w:hAnsi="${xmlEsc(f)}" w:cs="${xmlEsc(f)}"/>` +
    (fmt.bold ? '<w:b/>' : '') + (fmt.italic ? '<w:i/>' : '') +
    (fmt.color ? `<w:color w:val="${fmt.color}"/>` : '') +
    `<w:sz w:val="${fmt.half}"/><w:szCs w:val="${fmt.half}"/>` +
    '</w:rPr>';
  return '<w:r>' + rPr + '<w:t xml:space="preserve">' + xmlEsc(text) + '</w:t></w:r>';
}
function wBreak() { return '<w:r><w:br/></w:r>'; }
function wPageBreak() { return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }

function wImage(rid, id, wPt, hPt) {
  const cx = Math.round(wPt * EMU_PT), cy = Math.round(hPt * EMU_PT);
  return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">' +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${id}" name="Picture ${id}"/>` +
    '<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
    '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    `<pic:nvPicPr><pic:cNvPr id="${id}" name="Picture ${id}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
    '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/></w:style>
</w:styles>`;

const DOCX_NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/>
<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

/* ---- the conversion itself ---- */
async function convertToWord(opts, onStep) {
  const pdf = S.doc.pdf;
  const total = pdf.numPages;
  const media = [];              // {name, blob}
  const out = [];                // body XML pieces
  let pageW = 612, pageH = 792;
  let marginL = 72, marginT = 72, marginR = 72, marginB = 72;
  const stats = { paras: 0, images: 0, headings: 0, lists: 0, empty: 0 };
  const preview = [];
  const canvas = document.createElement('canvas');
  const needsPixels = opts.colour || opts.images;

  // a first pass over page 1 fixes the body size everything else is judged against
  let bodySize = 11;
  {
    const p1 = await pdf.getPage(1);
    const vp1 = p1.getViewport({ scale: 1 });
    const sizes = [];
    for (const l of wordLines((await p1.getTextContent()).items, vp1, p1)) {
      for (let i = 0; i < Math.max(1, l.str.length); i++) sizes.push(l.size);
    }
    if (sizes.length) { sizes.sort((a, b) => a - b); bodySize = sizes[Math.floor(sizes.length / 2)]; }
  }

  for (let n = 1; n <= total; n++) {
    const page = await pdf.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    /* THIS page's size, not page one's. The crops and the colour samples are
       taken from a canvas rendered at this page's own viewport, so measuring
       against page one cut the pictures out of the wrong part of the image —
       and on a page larger than the first, out of thin air. A report with one
       landscape table page in it is the ordinary case, not a corner one. */
    const pgW = vp.width, pgH = vp.height;
    if (n === 1) { pageW = pgW; pageH = pgH; }

    const lines = wordLines((await page.getTextContent()).items, vp, page);
    const blocks = wordBlocks(lines);
    const rects = opts.images ? await wordImageRects(page, vp) : [];

    let painted = false;
    if (needsPixels && (blocks.length || rects.length)) {
      await renderToCanvas(n, opts.images ? 2 : 1, canvas, true);
      painted = true;
    }

    if (n === 1 && blocks.length) {
      marginL = Math.max(18, Math.min(...blocks.map(b => b.x)));
      marginT = Math.max(18, Math.min(...blocks.map(b => b.y)));
      marginR = Math.max(18, pageW - Math.max(...blocks.map(b => b.x + b.w)));
      marginB = Math.max(18, pageH - Math.max(...blocks.map(b => b.y + b.h)));
    }
    /* The column the text has to fit, on this page. A narrow first page
       followed by a wide one used to clamp every tab stop of the wide page's
       table to the same position, so the columns collapsed into one. */
    const pgColW = Math.max(120, pgW - marginL - marginR);

    /* Blocks that share a row are table cells, not stacked paragraphs. Joining
       them with real tab stops keeps a price list looking like a price list
       instead of a staircase of indents. */
    const rows = [];
    for (const b of blocks.slice().sort((a, c) => a.y - c.y || a.x - c.x)) {
      const row = rows[rows.length - 1];
      const ov = row ? Math.min(row.bottom, b.y + b.h) - Math.max(row.top, b.y) : 0;
      const minH = row ? Math.min(row.bottom - row.top, b.h) : 0;
      const sameish = row && Math.abs(row.size - b.size) < row.size * 0.5;
      const shortish = row && b.lines.length <= 3 && row.cells.every(c => c.lines.length <= 3);
      if (row && !opts.layout && sameish && shortish && ov > minH * 0.55 && b.x > row.cells[row.cells.length - 1].x) {
        row.cells.push(b);
        row.top = Math.min(row.top, b.y); row.bottom = Math.max(row.bottom, b.y + b.h);
      } else {
        rows.push({ top: b.y, bottom: b.y + b.h, size: b.size, cells: [b] });
      }
    }

    const colW = pgColW;
    const items = rows.map(r => ({ y: r.top, row: r })).concat(rects.map(r => ({ y: r.y, rect: r })));
    items.sort((a, b) => a.y - b.y);

    for (const item of items) {
      if (item.rect) {
        const cut = painted ? await cropToImage(canvas, pgW, pgH, item.rect) : null;
        if (!cut || !cut.blob) continue;
        const name = `image${media.length + 1}.${cut.ext}`;
        media.push({ name, blob: cut.blob });
        const rid = `rId${100 + media.length}`;
        stats.images++;
        // a picture wider than the column is scaled down rather than pushed off it
        let iw = item.rect.w, ih = item.rect.h;
        if (!opts.layout && iw > colW) { ih = ih * (colW / iw); iw = colW; }
        /* hRule="exact" at exactly the picture's own height left no room for
           the line box the drawing sits in, so the bottom edge of every
           picture was clipped. "atLeast" lets the frame grow to fit. */
        const pPr = opts.layout
          ? `<w:framePr w:w="${Math.round(item.rect.w * TW_PT)}" w:h="${Math.round(item.rect.h * TW_PT)}" w:hRule="atLeast" w:wrap="none" w:vAnchor="page" w:hAnchor="page" w:x="${Math.round(item.rect.x * TW_PT)}" w:y="${Math.round(item.rect.y * TW_PT)}"/>` +
            '<w:spacing w:after="0" w:line="0" w:lineRule="auto"/>'
          : '<w:spacing w:before="120" w:after="120"/>' +
            (item.rect.x - marginL > 24 && iw < colW - 24 ? `<w:ind w:left="${Math.round((item.rect.x - marginL) * TW_PT)}"/>` : '');
        out.push('<w:p><w:pPr>' + pPr + '</w:pPr>' + wImage(rid, media.length, iw, ih) + '</w:p>');
        continue;
      }

      const cells = item.row.cells.filter(c => c.str.trim());
      if (!cells.length) { stats.empty++; continue; }
      const multi = cells.length > 1;
      const b = cells[0];

      // heading? list? — judged against the body size of the document
      const ratio = b.size / bodySize;
      const boldish = weightClass(b.face) !== 'regular';
      const short = !multi && b.lines.length <= 2 && b.str.length < 120;
      let style = null;
      if (short && ratio >= 1.55) style = 'Heading1';
      else if (short && ratio >= 1.26) style = 'Heading2';
      else if (short && ratio >= 1.1 && boldish) style = 'Heading3';
      if (style) stats.headings++;

      let numId = 0, strip = 0;
      if (!opts.layout && !style && !multi) {
        const m1 = /^\s*[•▪●◦‣·∙*]\s+/.exec(b.lines[0].str);
        const m2 = /^\s*\d{1,2}[.)]\s+/.exec(b.lines[0].str);
        if (m1) { numId = 1; strip = m1[0].length; }
        else if (m2) { numId = 2; strip = m2[0].length; }
        if (numId) stats.lists++;
      }

      const runs = [];
      cells.forEach((cell, ci) => {
        if (ci) runs.push('<w:r><w:tab/></w:r>');
        let colour = null;
        if (opts.colour && painted && canvas.width) {
          const sm = sampleRun(canvas, pgW, pgH, { x: cell.x, y: cell.y, w: Math.max(6, cell.w), h: Math.max(6, cell.h) });
          if (!sm.busy) colour = wordColour(sm.fg);
        }
        cell.lines.forEach((l, li) => {
          if (li) runs.push(cell.flow && !opts.layout ? null : wBreak());
          l.segs.forEach((seg, si) => {
            let t = seg.str;
            if (ci === 0 && li === 0 && si === 0 && strip) t = t.slice(strip);
            if (li && cell.flow && !opts.layout && si === 0) t = ' ' + t.replace(/^\s+/, '');
            if (!t) return;
            runs.push(wRun(t, {
              font: wordFont(seg.face),
              bold: weightClass(seg.face) !== 'regular',
              italic: /italic|oblique/i.test(String(seg.face || '')),
              half: Math.max(2, Math.round(seg.size * 2)),
              color: colour
            }));
          });
        });
      });

      /* w:pPr's children are a SEQUENCE, and Word enforces it: pStyle, then
         framePr, numPr, tabs, spacing, ind, jc. Emitting them in the order
         they happened to be worked out — ind, then jc, then spacing, with
         numPr ahead of pStyle — is a schema violation, and Word answers it
         with the "unreadable content" repair dialog on any document with an
         indented, centred or bulleted paragraph in it. In other words: nearly
         all of them. Collect the pieces, then write them out in order. */
      const pp = { pStyle: '', framePr: '', numPr: '', tabs: '', spacing: '', ind: '', jc: '' };
      if (style) pp.pStyle = `<w:pStyle w:val="${style}"/>`;
      if (opts.layout) {
        pp.framePr = `<w:framePr w:w="${Math.round((b.w + b.size) * TW_PT)}" w:h="${Math.round((b.h + 2) * TW_PT)}" w:hRule="auto" w:wrap="none" w:vAnchor="page" w:hAnchor="page" w:x="${Math.round(b.x * TW_PT)}" w:y="${Math.round(b.y * TW_PT)}"/>`;
        pp.spacing = `<w:spacing w:after="0" w:line="${Math.round(b.lineH * TW_PT)}" w:lineRule="exact"/>`;
      } else {
        if (multi) {
          /* Positions that clamp onto each other are worse than none: two
             columns on one stop makes Word fall back to its half-inch
             defaults. Keep the distinct ones, in order, and drop a stop at
             zero, which Word ignores anyway. */
          const seen = new Set();
          const stops = [];
          for (const c of cells.slice(1)) {
            const pos = Math.round(clamp(c.x - marginL, 0, Math.max(40, colW - 20)) * TW_PT);
            if (pos <= 0 || seen.has(pos)) continue;
            seen.add(pos);
            stops.push(`<w:tab w:val="left" w:pos="${pos}"/>`);
          }
          if (stops.length) pp.tabs = '<w:tabs>' + stops.join('') + '</w:tabs>';
        }
        if (numId) {
          pp.numPr = `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`;
          // numId is only set when there is no heading style, so this cannot clash
          pp.pStyle = '<w:pStyle w:val="ListParagraph"/>';
        }
        const indent = Math.round((b.x - marginL) * TW_PT);
        if (!numId && !multi && indent > 140) pp.ind = `<w:ind w:left="${indent}"/>`;
        if (!multi) {
          const slackL = b.x - marginL, slackR = (marginL + colW) - (b.x + b.w);
          if (slackL > 28 && Math.abs(slackL - slackR) < Math.max(10, b.size)) pp.jc = '<w:jc w:val="center"/>';
        }
        const after = Math.round(Math.min(360, Math.max(60, (b.size * 0.42) * TW_PT)));
        const line = Math.round(240 * (b.lineH / (b.size * 1.2)));
        pp.spacing = `<w:spacing w:after="${after}" w:line="${clamp(line, 180, 480)}" w:lineRule="auto"/>`;
      }
      const pPrXml = pp.pStyle + pp.framePr + pp.numPr + pp.tabs + pp.spacing + pp.ind + pp.jc;
      out.push('<w:p><w:pPr>' + pPrXml + '</w:pPr>' + runs.filter(Boolean).join('') + '</w:p>');
      stats.paras++;
      if (preview.length < 60) preview.push({
        str: cells.map(c => c.lines.map(l => l.str).join(c.flow && !opts.layout ? ' ' : '\n')).join('\t'),
        size: b.size, style,
        bold: boldish, colour: null, font: wordFont(b.face), cells: cells.length
      });
    }

    if (n < total && (opts.breaks || opts.layout)) out.push(wPageBreak());
    if (onStep) onStep(n / total);
  }

  // ---- assemble the package ----
  const mar = opts.layout
    ? { t: 360, r: 360, b: 360, l: 360 }
    : { t: Math.round(marginT * TW_PT), r: Math.round(marginR * TW_PT), b: Math.round(marginB * TW_PT), l: Math.round(marginL * TW_PT) };
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(pageW * TW_PT)}" w:h="${Math.round(pageH * TW_PT)}"${pageW > pageH ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${mar.t}" w:right="${mar.r}" w:bottom="${mar.b}" w:left="${mar.l}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;

  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<w:body>' + out.join('') + sect + '</w:body></w:document>';

  const rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>'];
  media.forEach((m, i) => rels.push(`<Relationship Id="rId${101 + i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`));
  rels.push('</Relationships>');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  zip.file('word/document.xml', documentXml);
  zip.file('word/styles.xml', DOCX_STYLES);
  zip.file('word/numbering.xml', DOCX_NUMBERING);
  zip.file('word/_rels/document.xml.rels', rels.join(''));
  for (const m of media) zip.file('word/media/' + m.name, m.blob);

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { bytes, stats, preview };
}

/* ---- the tool ---- */
function mountToWord() {
  if (!S.doc) return needDoc('Open a PDF to convert', null, async files => {
    if (await openPdfFile(files[0])) mountToWord();
  });
  const stage = $('#wb-stage');
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const opts = { layout: false, images: true, colour: true, breaks: true };
  let built = null, busy = false;

  const saveBtn = h('button', { class: 'btn primary', onclick: () => save() }, ico('save'), 'Save .docx');
  $('#wb-actions').append(saveBtn);

  function panel() {
    clear(side).append(
      h('div', { class: 'pane-h' }, 'PDF → Word'),
      h('p', { style: 'font-size:13px;color:var(--ink-2);margin-bottom:14px' },
        'Paragraphs are rebuilt from the glyph positions, so the result is editable text rather than a picture.'),
      h('div', { class: 'field' },
        h('label', null, 'Shape'),
        h('div', { class: 'seg' },
          h('button', { 'aria-pressed': !opts.layout, onclick: () => { opts.layout = false; built = null; panel(); run(); } }, 'Editable flow'),
          h('button', { 'aria-pressed': opts.layout, onclick: () => { opts.layout = true; built = null; panel(); run(); } }, 'Keep layout')),
        h('span', { class: 'hint' }, opts.layout
          ? 'Every block is pinned where the PDF put it. Looks like the original, awkward to re-edit.'
          : 'Paragraphs flow and re-wrap as you type, with headings, lists and indents.')),
      check('Pictures', 'images', 'Cut from the page at 2× and placed in the document.'),
      check('Text colour', 'colour', 'Sampled from the rendered page.'),
      opts.layout ? null : check('Page breaks', 'breaks', 'Break where the PDF breaks.'),
      h('details', { style: 'margin-top:16px;font-size:12px;color:var(--ink-2)' },
        h('summary', { style: 'cursor:pointer;color:var(--ink-3)' }, 'What does not carry over'),
        h('p', { style: 'margin-top:8px' },
          'Tables arrive as plain paragraphs, not Word tables. Footnotes, headers and footers become ordinary text at the point they appear. A scanned page has no text to rebuild — it comes through as a picture.'))
    );
  }
  function check(label, key, hint) {
    const id = 'w-' + key;
    return h('div', { class: 'field' },
      h('label', { for: id, style: 'display:flex;align-items:center;gap:8px;cursor:pointer' },
        h('input', {
          type: 'checkbox', id, checked: opts[key],
          onchange: e => { opts[key] = e.target.checked; built = null; panel(); run(); }
        }), label),
      h('span', { class: 'hint' }, hint));
  }

  /* A conversion runs for several seconds over every page, reading `opts` as it
     goes. Toggling a switch mid-run therefore changed the settings underneath
     it: the pages already done kept the old shape and the rest took the new
     one, so the file came out half flowing paragraphs and half pinned frames,
     with the panel showing a state the document did not have — and because
     run() returned early while busy, the change was never converted properly
     either. Each run now works from a frozen copy, and a change made during one
     is queued and run when it finishes. */
  let pending = false;
  async function run() {
    if (busy) { pending = true; return; }
    busy = true; pending = false; saveBtn.disabled = true;
    const mine = ownsScreen();
    const settings = Object.assign({}, opts);
    clear(stage).append(h('div', { class: 'empty' }, h('div', { class: 'inner' },
      ico('word'), h('h3', null, 'Rebuilding the document…'),
      h('p', null, 'Reading every page, grouping the glyphs into paragraphs.'))));
    progress(0.04);
    try {
      const made = await convertToWord(settings, f => { if (mine()) progress(0.04 + 0.92 * f); });
      if (!mine()) return;
      built = made;
      progress(null);
      show();
    } catch (e) {
      progress(null);
      console.error(e);
      if (!mine()) return;
      built = null;
      clear(stage).append(h('div', { class: 'empty' }, h('div', { class: 'inner' },
        ico('file'), h('h3', null, 'Could not convert this document'),
        h('p', null, String(e && e.message || e)))));
      toast('Conversion failed.', true);
    } finally {
      busy = false;
      if (mine()) {
        saveBtn.disabled = !built;
        if (pending) run();
      }
    }
  }

  function show() {
    const s = built.stats;
    const body = h('div', { style: 'padding:20px 18px 60px;max-width:780px;margin:0 auto;width:100%' });
    body.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-3);margin-bottom:4px' },
      `${s.paras} paragraph${s.paras === 1 ? '' : 's'} · ${s.headings} heading${s.headings === 1 ? '' : 's'} · ` +
      `${s.lists} list item${s.lists === 1 ? '' : 's'} · ${s.images} picture${s.images === 1 ? '' : 's'} · ${fmtBytes(built.bytes.length)}`));
    if (s.paras < 3) body.append(h('p', { style: 'color:var(--mark);font-size:13.5px;margin-bottom:12px' },
      'Almost no text was found — this document is very likely a scan, so the Word file will be little more than pictures.'));
    body.append(h('div', { class: 'pane-h', style: 'margin:18px 0 10px' }, 'Preview'));
    const sheet = h('div', {
      style: 'background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:26px 30px;box-shadow:var(--shadow)'
    });
    for (const p of built.preview) {
      sheet.append(h('p', {
        style: `margin:0 0 ${p.style ? 6 : 10}px;font-family:${JSON.stringify(p.font)},serif;` +
          `font-size:${Math.min(28, Math.max(10, p.size)).toFixed(1)}px;line-height:1.35;` +
          `font-weight:${p.bold || p.style ? 600 : 400};` +
          (p.colour ? `color:#${p.colour};` : 'color:var(--ink);') +
          (p.style ? 'letter-spacing:-.01em;' : '') +
          (p.cells > 1 ? 'white-space:pre;overflow:hidden;text-overflow:ellipsis;' : 'white-space:pre-wrap;')
      }, p.str));
    }
    if (s.paras > built.preview.length) sheet.append(h('p', { class: 'hint', style: 'margin-top:14px' },
      `… and ${s.paras - built.preview.length} more paragraph${s.paras - built.preview.length === 1 ? '' : 's'} in the file.`));
    body.append(sheet);
    clear(stage).append(body);
  }

  async function save() {
    if (!built) return;
    await offerFile(outName(S.doc.name, '', '.docx'), built.bytes.slice(0));
  }

  panel();
  run();
}

/* ============================================== pointer input and ink shape

   A stylus is not a mouse. On a tablet the browser's first instinct when a
   pointer moves across a scrollable page is to pan it, which cancels the
   gesture mid-stroke; it delivers one move per frame while a pencil samples at
   several hundred hertz; and it reports a palm resting on the glass as an
   ordinary touch. These helpers deal with all three, and carry the pressure the
   pencil reports through to the width of the line. */

/* Every sample the browser buffered since the last frame, not just the latest —
   this is the difference between a smooth curve and a row of chords. */
function allSamples(ev) {
  if (typeof ev.getCoalescedEvents === 'function') {
    try {
      const list = ev.getCoalescedEvents();
      if (list && list.length) return list;
    } catch (e) { /* older engines throw instead of returning nothing */ }
  }
  return [ev];
}

/* A pencil reports 0..1; a mouse reports 0.5 while a button is down and a
   finger often reports 0, so only a real stylus is allowed to vary the line. */
function penWidth(ev, base) {
  if (ev.pointerType !== 'pen') return base;
  const p = typeof ev.pressure === 'number' && ev.pressure > 0 ? ev.pressure : 0.5;
  return +(base * (0.45 + 1.15 * p)).toFixed(3);
}

/* Ignore the heel of a hand once a stylus has been seen on this document. It
   switches itself on the first time a pen touches the glass, and the panel lets
   you switch it off again for a session of finger drawing. */
function isPalm(ev) {
  return ev.pointerType === 'touch' && S.penSeen && S.penOnly;
}

/* Hold the gesture on one element so a stroke that wanders off the page, over
   the panel or past the window edge still arrives in one piece. */
function captureGesture(el, ev, { move, end, cancel }) {
  const id = ev.pointerId;
  let captured = false;
  try { el.setPointerCapture(id); captured = true; } catch (e) { captured = false; }
  /* Capture is refused on an element that is no longer in the document — and a
     repaint detaches elements constantly. When it is refused, listen on the
     window instead, which is always there; otherwise the gesture would get no
     events at all. */
  if (!captured) el = window;
  const onMove = e => { if (e.pointerId === id) move(e); };
  let done = false;
  const finish = kind => e => {
    if (e && e.pointerId !== id) return;
    if (done) return;
    done = true;
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancelled);
    el.removeEventListener('lostpointercapture', cancelled);
    /* Without capture there is no lostpointercapture to fall back on, and a
       release outside the window never reaches us either — so these two catch
       the gesture that would otherwise have left its listeners on the window
       for the life of the tab. A stale handler is worse than a leak: the mouse
       reuses pointerId 1, so the next stroke's samples were being appended to
       the abandoned one. */
    window.removeEventListener('blur', cancelled);
    document.removeEventListener('visibilitychange', onHide);
    if (captured) { try { el.releasePointerCapture(id); } catch (e2) {} }
    if (kind === 'up') end && end(e);
    /* An explicit cancel means the system took the gesture away — a scroll
       taking over, the pencil's own cancellation, the window losing focus. It
       must not fall through to end(), which commits: an erase the OS cancelled
       was still destroying whatever the half-drawn rubber had passed over. */
    else if (cancel) cancel(e);
  };
  const up = finish('up');
  const cancelled = finish('cancel');
  const onHide = () => { if (document.visibilityState === 'hidden') cancelled(); };
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancelled);
  el.addEventListener('lostpointercapture', cancelled);
  window.addEventListener('blur', cancelled);
  document.addEventListener('visibilitychange', onHide);
}

/* A stroke is stored as [x, y, width]. Consecutive segments of a similar width
   are drawn as one path, so a pressure-varying line is a handful of elements
   rather than one per sample. */
function inkRuns(a) {
  const base = a.strokeW || 2;
  const q = w => Math.max(0.2, Math.round((w || base) * 4) / 4);     // 0.25pt steps
  const runs = [];
  for (let i = 1; i < a.pts.length; i++) {
    const w = q(((a.pts[i][2] || base) + (a.pts[i - 1][2] || base)) / 2);
    const last = runs[runs.length - 1];
    if (last && last.w === w) last.pts.push(a.pts[i]);
    else runs.push({ w, pts: [a.pts[i - 1], a.pts[i]] });
  }
  if (!runs.length && a.pts.length === 1) runs.push({ w: q(a.pts[0][2]), pts: [a.pts[0], a.pts[0]] });
  return runs;
}

function inkPathData(pts, ox, oy) {
  return pts.map((p, i) => (i ? 'L' : 'M') + (p[0] - ox).toFixed(2) + ' ' + (p[1] - oy).toFixed(2)).join(' ');
}

/* ==================================================== shapes and the eraser

   Circle and arrow are ordinary vector objects: they draw as SVG on screen and
   as real PDF geometry on save. The eraser is the interesting one. Rubbing out
   part of a pen stroke is exact — the points under the rubber are dropped and
   the stroke splits into the pieces that survive, so it stays vector and the
   page underneath is never touched. Nothing else can be cut that way, so a
   shape, a text box or a picture that is partly rubbed out is re-drawn once as
   a bitmap with the rubbed-out pixels knocked out of it. Either way the eraser
   only ever takes away things you added; the document's own ink is not its
   business — that is what a white Box is for. */

/* The brightness/contrast/saturation/greyscale a lifted picture carries, as a
   CSS filter. This lives at the top level because the eraser needs it too:
   while it was a local inside mountEditor, rubbing out any picture threw a
   ReferenceError that the eraser's own catch reported as "that object could
   not be rubbed out". */
function cssFilter(f) {
  return `brightness(${f.b}%) contrast(${f.c}%) saturate(${f.s}%) grayscale(${f.g}%)`;
}

/* How a text object wraps, and therefore how tall it is. A text annotation
   carries a width but no height — the lines fall out of the wrap — so anything
   that needs its box has to lay the text out first. Measured with a canvas
   context rather than the PDF metrics, because this is used for hit-testing
   and re-drawing on screen, where the browser's wrap is the truth. */
let TEXTMEASURE = null;
function textLines(a) {
  const text = String(a.text == null ? '' : a.text);
  const width = a.w > 0 ? a.w : 0;
  if (!width) return text.split('\n');
  let ctx = TEXTMEASURE;
  if (!ctx) {
    try { ctx = TEXTMEASURE = document.createElement('canvas').getContext('2d'); } catch (e) { ctx = null; }
  }
  if (!ctx) return text.split('\n');
  const wt = /Bold/.test(a.font || '') ? 700 : 400;
  const st = /Italic|Oblique/.test(a.font || '') ? 'italic' : 'normal';
  ctx.font = `${st} ${wt} ${a.size}px ${fontCss(a.font)}`;
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    /* split, not trim: the capture keeps the run of spaces the user typed, so
       a line that is deliberately indented stays indented. */
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const probe = line + word;
      if (line && !/^\s+$/.test(word) && ctx.measureText(probe).width > a.w) { out.push(line); line = word; }
      else line = probe;
    }
    out.push(line);
  }
  return out;
}
function textHeight(a) {
  const lh = a.lh || a.size * 1.22;
  return (textLines(a).length - 1) * lh + a.size * 1.1;
}

/* The narrowest a text box may ever be. A box narrower than its own letters
   lays them out one per line — the text runs vertically down the page — so
   every path that sets a width goes through this floor. Five times the type
   size is roughly five or six characters: narrow, but still a line of text
   rather than a column of letters. */
function minTextWidth(a) { return Math.max(40, (a.size || 12) * 5); }

/* The last line of defence, and the only one that cannot be gone round.

   Clamping at each place a width is SET only works if every such place is
   known — and one was not: a box reached the page 25px wide and laid out one
   letter per line. So the width is repaired here instead, where the object is
   about to be drawn or written out, whatever put it in that state: an older
   build, a file edited by one, a path still unaccounted for. */
function fixTextBox(a, pageW) {
  if (a.type !== 'text') return a;
  if (!Number.isFinite(a.size) || a.size < 1) a.size = 12;
  const min = minTextWidth(a);
  if (!Number.isFinite(a.w) || a.w < min) a.w = min;
  if (Number.isFinite(pageW) && pageW > 0 && Number.isFinite(a.x)) {
    // never wider than the sheet, and pulled back on if it hangs off the edge
    a.w = Math.min(a.w, Math.max(min, pageW - 4));
    if (a.x + a.w > pageW - 2) a.x = Math.max(2, pageW - 2 - a.w);
  }
  return a;
}

/* A comment is an arrow with a boxed note at its tail. The arrow leaves
   whichever edge of the note faces the thing being pointed at, so it never
   crosses its own label, and the note is laid out exactly as a text box is. */
function calloutGeom(a) {
  const size = a.size || 12;
  const bw = Math.max(1, a.strokeW || 1.5);
  const pad = Math.max(3, size * 0.38);
  const inner = Math.max(a.w || 0, size * 4);
  const lh = a.lh || size * 1.3;
  const lines = textLines({ text: a.text, w: inner, size, font: a.font, lh });
  const textH = (lines.length - 1) * lh + size * 1.15;
  const label = { x: a.lx, y: a.ly, w: inner + (pad + bw) * 2, h: textH + (pad + bw) * 2 };
  const tip = { x: a.x, y: a.y };
  const cx = label.x + label.w / 2, cy = label.y + label.h / 2;
  const dx = tip.x - cx, dy = tip.y - cy;
  let from = { x: cx, y: cy };
  if (dx || dy) {
    // walk out from the centre until one of the two edges is reached
    const t = Math.min(dx ? (label.w / 2) / Math.abs(dx) : Infinity,
                       dy ? (label.h / 2) / Math.abs(dy) : Infinity);
    from = { x: cx + dx * t, y: cy + dy * t };
  }
  const x0 = Math.min(label.x, tip.x), y0 = Math.min(label.y, tip.y);
  const x1 = Math.max(label.x + label.w, tip.x), y1 = Math.max(label.y + label.h, tip.y);
  return { label, tip, from, pad, bw, lines, lh, size, inner,
           box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

function shapeBox(a) {
  if (a.type === 'callout') return calloutGeom(a).box;
  if (a.type === 'arrow' || a.type === 'line') {
    return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
  }
  if (a.pts && a.pts.length) {
    const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  /* A text object's height is not stored anywhere, so without this the eraser
     saw a box of zero height: rubbing across the words registered no hit at
     all, and when it did hit, the replacement canvas was shorter than the
     first baseline and the text came back blank. */
  if (a.type === 'text') return { x: a.x, y: a.y, w: a.w || 0, h: textHeight(a) };
  return { x: a.x, y: a.y, w: a.w || 0, h: a.h || 0 };
}

/* distance from a point to a line segment */
function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function underRubber(x, y, stroke, r) {
  const p = stroke.pts;
  if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= r;
  for (let i = 1; i < p.length; i++) {
    if (segDist(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= r) return true;
  }
  return false;
}

/* distance from a point to a rectangle, zero inside it */
function boxDist(px, py, box) {
  const dx = Math.max(box.x - px, 0, px - (box.x + box.w));
  const dy = Math.max(box.y - py, 0, py - (box.y + box.h));
  return Math.hypot(dx, dy);
}

/* Does the rubber's swept path come within r of this box? Testing only the
   sample points treated the rubber as a row of dots: dragged quickly, with one
   move per frame, the samples land ~17pt apart while the rubber is 14pt wide,
   so a line crossing between two of them was missed and the whole gesture was
   silently a no-op. Walking the segments tests the path the rubber actually
   travelled. */
function rubberHitsBox(box, stroke, r) {
  const p = stroke.pts;
  if (!p.length) return false;
  if (boxDist(p[0][0], p[0][1], box) <= r) return true;
  for (let i = 1; i < p.length; i++) {
    const [x1, y1] = p[i - 1], [x2, y2] = p[i];
    if (boxDist(x2, y2, box) <= r) return true;
    /* sample along the segment at a fraction of the rubber's own radius, which
       cannot step over a box the rubber would have covered */
    const len = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.min(64, Math.ceil(len / Math.max(1, r * 0.5)));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (boxDist(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, box) <= r) return true;
    }
  }
  return false;
}

/* Drop the points that fall under the rubber; what is left becomes one stroke
   per surviving run. Returns null when the stroke was not touched at all. */
function splitInk(a, stroke, r) {
  const keep = a.pts.map(p => !underRubber(p[0], p[1], stroke, r));
  if (keep.every(Boolean)) return null;
  const runs = [];
  let cur = [];
  a.pts.forEach((p, i) => {
    if (keep[i]) cur.push(p.slice());
    else if (cur.length) { runs.push(cur); cur = []; }
  });
  if (cur.length) runs.push(cur);
  /* Keep a run of one point as well. Dropping those threw away the ink either
     side of a small rub — on a short stroke it erased the whole thing — and a
     single point is a dot the pen itself can draw, so there is nothing here
     that cannot be rendered or exported. */
  return runs.filter(run => run.length >= 1);
}

/* ---- drawing an object onto a 2D context, for the rubbed-out case ---- */
function paintAnnot(ctx, a, k, ox, oy) {
  ctx.save();
  ctx.translate(-ox * k, -oy * k);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = a.color || '#000';
  ctx.fillStyle = a.color || '#000';
  ctx.lineWidth = Math.max(0.5, (a.strokeW || 1) * k);
  if (a.type === 'rect') {
    ctx.strokeRect(a.x * k, a.y * k, a.w * k, a.h * k);
  } else if (a.type === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse((a.x + a.w / 2) * k, (a.y + a.h / 2) * k, Math.abs(a.w / 2) * k, Math.abs(a.h / 2) * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.type === 'arrow') {
    const x1 = a.x * k, y1 = a.y * k, x2 = (a.x + a.w) * k, y2 = (a.y + a.h) * k;
    const head = arrowHead(a);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.l[0] * k, head.l[1] * k); ctx.lineTo(x2, y2); ctx.lineTo(head.r[0] * k, head.r[1] * k);
    ctx.stroke();
  } else if (a.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(a.x * k, a.y * k);
    ctx.lineTo((a.x + a.w) * k, (a.y + a.h) * k);
    ctx.stroke();
  } else if (a.type === 'callout') {
    const g = calloutGeom(a);
    const stem = { x: g.from.x, y: g.from.y, w: g.tip.x - g.from.x, h: g.tip.y - g.from.y, strokeW: a.strokeW };
    const head = arrowHead(stem);
    ctx.lineWidth = Math.max(0.5, g.bw * k);
    ctx.beginPath(); ctx.moveTo(g.from.x * k, g.from.y * k); ctx.lineTo(g.tip.x * k, g.tip.y * k); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(head.l[0] * k, head.l[1] * k); ctx.lineTo(g.tip.x * k, g.tip.y * k); ctx.lineTo(head.r[0] * k, head.r[1] * k);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(g.label.x * k, g.label.y * k, g.label.w * k, g.label.h * k);
    ctx.strokeRect(g.label.x * k, g.label.y * k, g.label.w * k, g.label.h * k);
    ctx.fillStyle = a.color || '#000';
    const fam = fontCss(a.font);
    const wt = /Bold/.test(a.font || '') ? 700 : 400;
    ctx.font = `${wt} ${a.size * k}px ${fam}`;
    ctx.textBaseline = 'alphabetic';
    g.lines.forEach((line, i) => {
      ctx.fillText(line, (g.label.x + g.pad + g.bw) * k,
        (g.label.y + g.pad + g.bw + a.size * 0.84) * k + i * g.lh * k);
    });
  } else if (a.type === 'hl') {
    ctx.globalAlpha = 0.55;
    ctx.fillRect(a.x * k, a.y * k, a.w * k, a.h * k);
    ctx.globalAlpha = 1;
  } else if (a.type === 'cover') {
    ctx.fillRect(a.x * k, a.y * k, a.w * k, a.h * k);
  } else if (a.type === 'ink') {
    for (const run of inkRuns(a)) {
      ctx.lineWidth = Math.max(0.5, run.w * k);
      ctx.beginPath();
      run.pts.forEach((p, i) => i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k));
      ctx.stroke();
    }
  } else if (a.type === 'text') {
    const fam = fontCss(a.font);
    const wt = /Bold/.test(a.font) ? 700 : 400;
    const st = /Italic|Oblique/.test(a.font) ? 'italic' : 'normal';
    ctx.font = `${st} ${wt} ${a.size * k}px ${fam}`;
    ctx.textBaseline = 'alphabetic';
    const lh = (a.lh || a.size * 1.22) * k;
    /* the same wrap the screen uses, so a re-drawn block keeps its line breaks
       instead of running off the right edge as one long line */
    textLines(a).forEach((line, i) => {
      ctx.fillText(line, a.x * k, (a.y + a.size * 0.82) * k + i * lh);
    });
  }
  ctx.restore();
}

/* the two barbs of an arrow head, in page points */
function arrowHead(a) {
  const ang = Math.atan2(a.h, a.w);
  const len = Math.max(6, Math.min(16, Math.hypot(a.w, a.h) * 0.22, (a.strokeW || 2) * 5));
  const spread = 0.42;
  const tipX = a.x + a.w, tipY = a.y + a.h;
  return {
    l: [tipX - len * Math.cos(ang - spread), tipY - len * Math.sin(ang - spread)],
    r: [tipX - len * Math.cos(ang + spread), tipY - len * Math.sin(ang + spread)]
  };
}

/* Re-draw one object with the rubbed-out pixels knocked out, and hand back a
   picture to put in its place. */
async function rubberise(a, strokes) {
  const box = shapeBox(a);
  const pad = Math.max(4, (a.strokeW || 2) * 2, a.type === 'text' ? a.size * 0.5 : 0);
  const x = box.x - pad, y = box.y - pad, w = box.w + pad * 2, h = box.h + pad * 2;
  if (w < 1 || h < 1) return null;
  const k = clamp(Math.sqrt(2.2e6 / Math.max(1, w * h)), 1.5, 4);     // ~4x, capped by area
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  const ctx = cv.getContext('2d');

  if (a.type === 'img') {
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = rej;
      im.src = a.url;
    });
    ctx.save();
    if (a.filter) ctx.filter = cssFilter(a.filter);
    if (a.opacity != null) ctx.globalAlpha = a.opacity;
    ctx.drawImage(img, (a.x - x) * k, (a.y - y) * k, a.w * k, a.h * k);
    ctx.restore();
  } else {
    paintAnnot(ctx, a, k, x, y);
  }

  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
  for (const s of strokes) {
    ctx.lineWidth = Math.max(1, s.strokeW * k);
    ctx.beginPath();
    s.pts.forEach((p, i) => {
      const px = (p[0] - x) * k, py = (p[1] - y) * k;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    if (s.pts.length === 1) { ctx.lineTo((s.pts[0][0] - x) * k + 0.01, (s.pts[0][1] - y) * k); }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  /* The export path embeds bytes, not a data URL, so hand back both. */
  const blob = await toBlobOrThrow(cv, 'image/png');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    id: uid(), type: 'img', page: a.page, x, y, w, h,
    url: cv.toDataURL('image/png'), bytes, fmt: 'png',
    rubbed: true, nat: { w: cv.width, h: cv.height }
  };
}

/* ========================================== preparing a scan for recognition

   Tesseract does its own thresholding, and it does it well, so binarising first
   makes things worse — measured on a photocopied thermal receipt, Otsu cost six
   points and an adaptive threshold four. What does help is evening out the
   local contrast and putting the edges back on strokes that the copier
   flattened: on that same page, colour straight from the renderer scored 78%
   against a hand-transcribed ground truth, and this pipeline 85% — 89% once the
   words the recogniser itself has no confidence in are dropped. */

/* Contrast-limited adaptive histogram equalisation. Each tile gets its own
   curve, clipped so that noise in a blank area is not amplified into speckle,
   and the four nearest curves are blended across each pixel so no tile edges
   show. */
function claheGray(data, w, h, tilesX = 8, tilesY = 8, clip = 2.0) {
  const tw = Math.ceil(w / tilesX), th = Math.ceil(h / tilesY);
  const luts = new Uint8Array(tilesX * tilesY * 256);
  const hist = new Int32Array(256);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      hist.fill(0);
      const x0 = tx * tw, y0 = ty * th;
      const x1 = Math.min(w, x0 + tw), y1 = Math.min(h, y0 + th);
      let n = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) { hist[data[row + x]]++; n++; }
      }
      if (!n) continue;
      // clip the tall bins and share what was cut back out evenly
      const limit = Math.max(1, Math.floor(clip * n / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
      const give = Math.floor(excess / 256);
      let left = excess - give * 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += give;
        if (left > 0) { hist[i]++; left--; }
      }
      const base = (ty * tilesX + tx) * 256;
      let run = 0;
      for (let i = 0; i < 256; i++) { run += hist[i]; luts[base + i] = Math.round(run * 255 / n); }
    }
  }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(tilesY - 1, Math.max(0, (y - th / 2) / th));
    const ty0 = Math.floor(fy), ty1 = Math.min(tilesY - 1, ty0 + 1), wy = fy - ty0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(tilesX - 1, Math.max(0, (x - tw / 2) / tw));
      const tx0 = Math.floor(fx), tx1 = Math.min(tilesX - 1, tx0 + 1), wx = fx - tx0;
      const v = data[y * w + x];
      const a = luts[(ty0 * tilesX + tx0) * 256 + v], b = luts[(ty0 * tilesX + tx1) * 256 + v];
      const c = luts[(ty1 * tilesX + tx0) * 256 + v], d = luts[(ty1 * tilesX + tx1) * 256 + v];
      out[y * w + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
    }
  }
  return out;
}

/* Three box blurs make a close enough Gaussian, and a box blur is two passes of
   a running sum — cheap enough to do on a full 300 dpi page. */
function blurGray(src, w, h, radius) {
  let a = Uint8ClampedArray.from(src), b = new Uint8ClampedArray(w * h);
  for (let pass = 0; pass < 3; pass++) {
    const r = radius, span = r * 2 + 1;
    for (let y = 0; y < h; y++) {                       // horizontal
      const row = y * w;
      let sum = a[row] * (r + 1);
      for (let i = 1; i <= r; i++) sum += a[row + Math.min(w - 1, i)];
      for (let x = 0; x < w; x++) {
        b[row + x] = sum / span;
        sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {                       // vertical
      let sum = b[x] * (r + 1);
      for (let i = 1; i <= r; i++) sum += b[Math.min(h - 1, i) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / span;
        sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x];
      }
    }
  }
  return a;
}

/* Grey, even out the contrast, then put the edges back. Returns a new canvas;
   the original render is left alone, since it is what the reader sees. */
function prepForOcr(canvas, opts) {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return canvas;
  const src = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
  const px = src.data;
  let gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    gray[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
  }
  if (opts.contrast) gray = claheGray(gray, w, h);
  if (opts.sharpen) {
    const blur = blurGray(gray, w, h, 2);
    const amt = 1.4;
    for (let i = 0; i < gray.length; i++) gray[i] = gray[i] * (1 + amt) - blur[i] * amt;
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const img = new ImageData(w, h);
  for (let i = 0, j = 0; i < img.data.length; i += 4, j++) {
    img.data[i] = img.data[i + 1] = img.data[i + 2] = gray[j];
    img.data[i + 3] = 255;
  }
  out.getContext('2d').putImageData(img, 0, 0);
  return out;
}

/* ================================================================= OCR

   A scanned page is a picture of words: there is no text to select, search or
   copy. Tesseract runs here as WebAssembly — the engine, the English model and
   all — so the page never leaves the tab. Every word comes back with a box,
   which is enough for two things at once: a selectable layer over the picture
   on screen, and an invisible text layer written into the saved PDF, which is
   exactly how a searchable scan is built. */

let TESS = null, TESS_BUSY = null, TESS_MODEL = null;

/* The English model is fetched by hand rather than left to Tesseract, because
   the host this page is published on only serves a fixed set of file
   extensions and .traineddata is not among them. The bytes are the same
   either way; the worker takes them directly. */
async function ocrModel() {
  if (TESS_MODEL) return TESS_MODEL;
  const tries = ['lib/tess/lang/eng.traineddata.wasm', 'lib/tess/lang/eng.traineddata'].map(ocrUrl);
  let last = null;
  for (const url of tries) {
    try {
      const r = await fetch(url);
      if (!r.ok) { last = 'HTTP ' + r.status; continue; }
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length < 100000) { last = 'the file came back too small'; continue; }
      TESS_MODEL = b;
      return b;
    } catch (e) { last = String(e && e.message || e); }
  }
  throw new Error('The English model could not be loaded (' + last + ').');
}

/* The page can run in places with a stricter policy than a plain web server —
   a sandboxed frame may forbid WebAssembly, or workers, or both. When the
   engine will not start, these three checks say which one it was, so the panel
   can report something more useful than "it did not work". */
async function ocrDiagnose() {
  const out = { worker: null, wasm: null, model: null };
  // 1. can this page start a worker at all?
  try {
    const src = 'self.onmessage=function(){postMessage("ok")}';
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    out.worker = await new Promise(res => {
      const t = setTimeout(() => res('no reply within 5s'), 5000);
      w.onmessage = () => { clearTimeout(t); res('ok'); };
      w.onerror = e => { clearTimeout(t); res('blocked: ' + (e.message || 'worker error')); };
      w.postMessage(1);
    });
    w.terminate(); URL.revokeObjectURL(url);
  } catch (e) { out.worker = 'blocked: ' + (e && e.message || e); }

  // 2. is WebAssembly allowed to compile here?
  try {
    const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);   // an empty module
    await WebAssembly.instantiate(bytes);
    out.wasm = 'ok';
  } catch (e) { out.wasm = 'blocked: ' + (e && e.message || e); }

  // 3. where do the engine's own files resolve to?
  out.base = ocrUrl('lib/tess/worker.min.js');

  // 4. is the model actually reachable?
  try {
    const b = await ocrModel();
    out.model = 'ok, ' + fmtBytes(b.length);
  } catch (e) { out.model = String(e && e.message || e); }
  return out;
}

/* tesseract.js starts its worker by building a tiny blob that calls
   importScripts(workerPath). A blob created in a sandboxed frame has an opaque
   origin, so a RELATIVE path inside it cannot be resolved at all — the browser
   rejects it outright. Everything handed to the engine is therefore made
   absolute against this document first. */
function ocrUrl(rel) {
  try { return new URL(rel, document.baseURI).href; } catch (e) { return rel; }
}

async function ocrEngine(onLog) {
  if (TESS) return TESS;
  if (TESS_BUSY) return TESS_BUSY;
  if (typeof Tesseract === 'undefined') throw new Error('The OCR engine did not load.');
  TESS_BUSY = (async () => {
    if (onLog) onLog({ status: 'loading language traineddata', progress: 0 });
    const data = await ocrModel();
    /* Racing a timeout only settles the race — the attempt behind it carries
       on, and if it finished later nobody was left holding it, so a slow start
       followed by the retry below left a whole engine (wasm core plus the
       English model) running with no way to reach it. Terminate the loser. */
    const spawn = blobURL => {
      const task = Tesseract.createWorker([{ code: 'eng', data }], 1, {
        workerPath: ocrUrl('lib/tess/worker.min.js'),
        corePath: ocrUrl('lib/tess/core'),
        workerBlobURL: blobURL,
        logger: m => { if (onLog) onLog(m); }
      });
      let lost = false;
      task.then(w => { if (lost) { try { w.terminate(); } catch (e) {} } }, () => {});
      return Promise.race([
        task,
        new Promise((_, rej) => setTimeout(() => {
          lost = true;
          rej(new Error('the engine did not finish starting within 45 seconds'));
        }, 45000))
      ]);
    };
    let w;
    try {
      w = await spawn(true);
    } catch (e) {
      // a frame that will not run a blob worker may still run one loaded directly
      w = await spawn(false);
    }
    TESS = w; TESS_BUSY = null;
    return w;
  })();
  /* A failed start must not leave the shared promise behind, or every later
     attempt returns the same rejection without ever trying again. */
  TESS_BUSY.catch(() => { TESS_BUSY = null; });
  return TESS_BUSY;
}

/* Give the engine back. Nothing ever did this: a failed read followed by "Read
   again" left the old worker running, holding the wasm core and the ~13 MB
   model, and they stacked up for the life of the tab. The model BYTES are kept,
   so starting again is quick and needs no fetch. */
async function ocrRelease() {
  const w = TESS, busy = TESS_BUSY;
  TESS = TESS_BUSY = null;
  if (w) { try { await w.terminate(); } catch (e) {} }
  if (busy) {
    try { const late = await busy; if (late && late !== w) await late.terminate(); } catch (e) {}
  }
}

/* pdf.js hands back the words of a page that already has text; no point
   running OCR over something that is already searchable. */
async function pageHasText(pdf, n) {
  try {
    const tc = await (await pdf.getPage(n)).getTextContent();
    return tc.items.map(i => i.str).join('').replace(/\s+/g, '').length > 24;
  } catch (e) { return false; }
}

function ocrWords(data) {
  if (data && data.words && data.words.length) return data.words;
  const out = [];
  const walk = node => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.words) out.push(...node.words);
    ['blocks', 'paragraphs', 'lines'].forEach(k => node[k] && walk(node[k]));
  };
  walk(data && (data.blocks || data));
  return out;
}

/* Lines, not words, carry the on-screen layer: a span per line keeps the spaces
   and the reading order inside the string, so a selection comes out as prose
   rather than onelongrunofwords. */
function ocrLines(data) {
  const out = [];
  const walk = node => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.lines) out.push(...node.lines);
    ['blocks', 'paragraphs'].forEach(k => node[k] && walk(node[k]));
  };
  walk(data && (data.blocks || data));
  if (out.length) return out;
  // no structure came back — fall back to one span per word
  return ocrWords(data).map(w => ({ bbox: w.bbox, text: w.text, words: [w] }));
}

function mountOCR() {
  if (!S.doc) return needDoc('Open a PDF to read', null, async files => {
    if (await openPdfFile(files[0])) mountOCR();
  });
  const stage = $('#wb-stage');
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();

  const opts = { dpi: 300, skipText: true, contrast: true, sharpen: true, floor: 40, psm: 3 };
  const pages = [];            // {n, w, h, canvas, layer, words, text, state}
  let running = false, done = 0, note = null, stop = false;

  /* Leaving the tool, or opening another document, ends the run. Without this
     a read carried on in the background and kept calling sheet(), which clears
     the shared stage — so it wiped whatever tool had been opened in the
     meantime and drew its own page boxes there instead. */
  const mine = ownsScreen();
  const alive = () => !stop && mine();
  onCleanup(() => { stop = true; ocrRelease(); });

  const saveBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => saveSearchable() }, ico('save'), 'Save searchable PDF');
  const txtBtn = h('button', { class: 'btn sm', disabled: true, onclick: () => offerFile(outName(S.doc.name, '', '.txt'), allText()) }, 'Save .txt');
  const copyBtn = h('button', { class: 'btn sm', disabled: true, onclick: copyAll }, 'Copy all');
  $('#wb-actions').append(copyBtn, txtBtn, saveBtn);

  const allText = () => pages.map((p, i) => p.text ? `— page ${i + 1} —\n${p.text.trim()}` : '').filter(Boolean).join('\n\n');

  async function copyAll() {
    const t = allText();
    try { await navigator.clipboard.writeText(t); toast('Text copied'); }
    catch (e) {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' }, t);
      document.body.append(ta); ta.select();
      try { document.execCommand('copy'); toast('Text copied'); } catch (e2) { toast('Could not copy.', true); }
      ta.remove();
    }
  }

  function renderFloor() {
    const n = $('#ocr-floor');
    if (n) n.textContent = opts.floor ? 'below ' + opts.floor + '%' : 'keep all';
  }

  function panel() {
    clear(side).append(
      h('div', { class: 'pane-h' }, 'Read a scan'),
      h('p', { style: 'font-size:13px;color:var(--ink-2);margin-bottom:14px' },
        'Recognises the words in a page image and lays them over it, so you can select and copy them straight away.'),
      h('div', { class: 'field' },
        h('label', null, 'Detail'),
        h('div', { class: 'seg' },
          ...[[150, 'Fast'], [200, 'Normal'], [300, 'Fine']].map(([d, lbl]) =>
            h('button', { 'aria-pressed': opts.dpi === d, onclick: () => { opts.dpi = d; panel(); } }, lbl))),
        h('span', { class: 'hint' }, opts.dpi === 150 ? 'Quickest, and measurably worse: 79% against 91% on a photocopied receipt. Use it only on crisp print.'
          : opts.dpi === 300 ? 'The default, and the most accurate on faint or small type. About half again the time of Fast.'
          : 'As accurate as Fine on most scans, and a little quicker.')),
      h('div', { class: 'field' },
        h('label', { for: 'ocr-skip', style: 'display:flex;align-items:center;gap:8px;cursor:pointer' },
          h('input', { type: 'checkbox', id: 'ocr-skip', checked: opts.skipText, onchange: e => { opts.skipText = e.target.checked; panel(); } }),
          'Skip pages that already have text'),
        h('span', { class: 'hint' }, 'A page with a text layer is already selectable — nothing to gain by reading it again.')),
      h('div', { class: 'field' },
        h('label', { for: 'ocr-prep', style: 'display:flex;align-items:center;gap:8px;cursor:pointer' },
          h('input', { type: 'checkbox', id: 'ocr-prep', checked: opts.contrast && opts.sharpen,
            onchange: e => { opts.contrast = opts.sharpen = e.target.checked; panel(); } }),
          'Clean up the scan first'),
        h('span', { class: 'hint' }, 'Evens out local contrast and sharpens the strokes a copier flattened. Worth about seven points on a faint receipt; turn it off for a crisp scan.')),
      h('div', { class: 'field' },
        h('label', null, 'Discard unreadable words'),
        h('div', { class: 'rangerow' },
          h('input', { type: 'range', min: 0, max: 85, step: 5, value: opts.floor,
            oninput: e => { opts.floor = +e.target.value; renderFloor(); } }),
          h('span', { class: 'val', id: 'ocr-floor' }, opts.floor ? 'below ' + opts.floor + '%' : 'keep all')),
        h('span', { class: 'hint' }, 'The recogniser scores every word; anything under this goes in the bin — which is how the Arabic on a bilingual receipt stops arriving as nonsense. Measured on a photocopied receipt, 40% was the sweet spot: higher starts throwing away words that were right.')),
      h('div', { class: 'field' },
        h('label', null, 'Layout'),
        h('select', { onchange: e => { opts.psm = +e.target.value; } },
          ...[[3, 'Work it out'], [4, 'One column'], [6, 'One block'], [11, 'Scattered text']].map(([v, t]) =>
            h('option', { value: v, selected: opts.psm === v }, t))),
        h('span', { class: 'hint' }, 'Leave it to work the page out unless the result comes back jumbled.')),
      running
        /* A read of a long scan takes minutes, and until now there was no way
           to call it off short of leaving the tool. */
        ? h('button', {
            class: 'btn danger', style: 'width:100%;justify-content:center',
            onclick: e => {
              stop = true;
              e.currentTarget.disabled = true;
              e.currentTarget.textContent = 'Stopping after this page\u2026';
            }
          }, 'Stop reading')
        : h('button', {
            class: 'btn primary', style: 'width:100%;justify-content:center',
            onclick: () => start()
          }, ico('check'), done ? 'Read again' : 'Read the document'),
      running ? h('p', { class: 'hint', style: 'margin-top:8px' }, `Reading page ${Math.min(done + 1, pages.length)} of ${pages.length}…`) : null,
      note,
      h('details', { style: 'margin-top:16px;font-size:12px;color:var(--ink-2)' },
        h('summary', { style: 'cursor:pointer;color:var(--ink-3)' }, 'How this works'),
        h('p', { style: 'margin-top:8px' },
          'Tesseract runs as WebAssembly in this tab, with the English model served from the page itself — about 13 MB, fetched once, the first time you read a page. After that it is held in memory and works with the internet switched off, like the rest of the app. Saving writes the words back into the PDF as an invisible text layer over the picture, which is what makes a scan searchable in any reader.'),
        h('p', { style: 'margin-top:8px;color:var(--mark)' },
          'Recognition is never perfect. Expect mistakes in small type, handwriting, heavy skew or a poor scan — the picture of the page is never altered, so nothing is lost.'))
    );
  }

  function sheet() {
    clear(stage);
    const wrap = h('div', { class: 'sheet' });
    pages.forEach(p => {
      const box = h('div', { class: 'page', style: `width:${p.w}px;height:${p.h}px` });
      p.canvas.style.width = '100%'; p.canvas.style.height = '100%';
      p.layer = h('div', { class: 'ocrlayer' });
      box.append(p.canvas, p.layer, h('span', { class: 'pgnum mono' }, 'Page ' + p.n + (p.state ? ' · ' + p.state : '')));
      wrap.append(box);
    });
    stage.append(wrap);
  }

  function paintWords(p) {
    if (!p.layer) return;
    clear(p.layer);
    const k = p.w / p.px;                       // image pixels -> on-screen points
    for (const ln of p.lines || []) {
      const t = (ln.text || '').replace(/\s+/g, ' ').trim();
      // speckle on a skewed scan reads as a stray mark with no confidence
      if (!t || (!/[A-Za-z0-9]/.test(t) && (ln.confidence == null || ln.confidence < 70))) continue;
      const b = ln.bbox || ln;
      const x = b.x0 * k, y = b.y0 * k, ww = (b.x1 - b.x0) * k, hh = (b.y1 - b.y0) * k;
      if (ww < 2 || hh < 2) continue;
      const span = h('span', { class: 'ocrw', style: `left:${x}px;top:${y}px;font-size:${(hh * 0.86).toFixed(2)}px` }, t);
      if (ln.confidence != null && ln.confidence < 60) span.classList.add('low');
      p.layer.append(span);
      // a line break the selection can see, but the eye cannot
      p.layer.append(h('br', { role: 'presentation' }));
      // squeeze the line onto the ink it belongs to, the way a PDF text layer does
      const got = span.getBoundingClientRect().width;
      if (got > 0.5) span.style.transform = `scaleX(${clamp(ww / got, 0.05, 20).toFixed(4)})`;
    }
  }

  async function start() {
    if (running) return;
    running = true; stop = false; done = 0; note = null; panel();
    saveBtn.disabled = txtBtn.disabled = copyBtn.disabled = true;
    pages.length = 0;
    const total = S.doc.pages.length;
    /* iOS Safari refuses a canvas over about 16 million pixels and hands back a
       blank one, with no error — at 300 dpi an A4 page is 8.7 M, which was
       doubled to 34.8 M by the device pixel ratio the renderer used to add. So:
       render at exactly the dpi asked for, and cap the area, telling Tesseract
       the dpi it really got. Its layout and point-size heuristics depend on
       that number being true. */
    const AREA_CAP = 13e6;
    let shrunk = 0;
    const scaleFor = pg => {
      let s = opts.dpi / 72;
      if (pg.w * pg.h * s * s > AREA_CAP) { s = Math.sqrt(AREA_CAP / (pg.w * pg.h)); shrunk++; }
      return s;
    };
    let pre = null;

    try {
      // lay out the pages first so the words can appear on them one at a time
      for (let n = 1; n <= total; n++) {
        const pg = S.doc.pages[n - 1];
        const fit = Math.min(1, 760 / pg.w);
        pages.push({ n, w: pg.w * fit, h: pg.h * fit, ptW: pg.w, ptH: pg.h, canvas: document.createElement('canvas'), words: [], lines: [], text: '', state: 'waiting' });
      }
      sheet();

      progress(0.02);
      pre = await ocrDiagnose();
      if (pre.wasm !== 'ok' || pre.worker !== 'ok') {
        throw new Error(pre.wasm !== 'ok'
          ? 'WebAssembly is not allowed to run on this page'
          : 'this page is not allowed to start a worker');
      }
      let lastLog = 0;
      const worker = await ocrEngine(m => {
        if (m.status === 'recognizing text' && Date.now() - lastLog > 120) {
          lastLog = Date.now();
          progress(Math.min(0.98, (done + (m.progress || 0)) / total));
        }
      });

      for (let i = 0; i < pages.length; i++) {
        /* Two different kinds of stop: the screen no longer belongs to this run
           (leave at once, touch nothing), or the user asked it to stop (finish
           up and show what was read). */
        if (!mine()) return;
        if (stop) break;
        const p = pages[i];
        p.state = 'reading'; sheet(); paintAll();
        const shot = document.createElement('canvas');
        const s = scaleFor(S.doc.pages[p.n - 1]);
        const effDpi = Math.max(70, Math.round(s * 72));
        await renderToCanvas(p.n, s, shot, true);
        if (!mine()) return;
        p.px = shot.width;
        /* The viewer's copy is this same bitmap scaled down, rather than a
           second trip through the renderer — on a three-page scan that is half
           the rendering gone for an identical picture. */
        const show = Math.min(1, (p.w * 1.5) / shot.width);
        p.canvas.width = Math.max(1, Math.round(shot.width * show));
        p.canvas.height = Math.max(1, Math.round(shot.height * show));
        const cx = p.canvas.getContext('2d');
        cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
        cx.drawImage(shot, 0, 0, p.canvas.width, p.canvas.height);

        if (opts.skipText && await pageHasText(S.doc.pdf, p.n)) {
          /* Already searchable — but the overlay is still worth building from
             the document's own text, so selecting works the same either way. */
          const pj = await S.doc.pdf.getPage(p.n);
          const vp = pj.getViewport({ scale: 1 });
          const got = wordLines((await pj.getTextContent()).items, vp, pj);
          p.px = p.ptW;                                  // this layer is in points already
          p.lines = got.map(l => ({
            text: l.str, confidence: 100,
            bbox: { x0: l.x, y0: l.baseline - l.size * 0.82, x1: l.x + l.w, y1: l.baseline + l.size * 0.22 }
          }));
          p.words = [];
          p.text = got.map(l => l.str).join('\n').trim();
          p.state = 'already searchable';
        } else {
          await worker.setParameters({
            tessedit_pageseg_mode: String(opts.psm),
            user_defined_dpi: String(effDpi),
            preserve_interword_spaces: '1'
          });
          const prepared = (opts.contrast || opts.sharpen) ? prepForOcr(shot, opts) : shot;
          const { data } = await worker.recognize(prepared, {}, { text: true, blocks: true });
          if (!mine()) return;
          const all = ocrWords(data).filter(w => (w.text || '').trim());
          const sure = w => w.confidence == null || w.confidence >= opts.floor;
          p.dropped = opts.floor > 0 ? all.filter(w => !sure(w)).length : 0;
          p.words = opts.floor > 0 ? all.filter(sure) : all;
          /* The lines on screen follow the same rule, and a line is rebuilt from
             the words that survived rather than from Tesseract's own string —
             otherwise the junk would still be selectable. */
          p.lines = ocrLines(data).map(l => {
            const kept = (l.words || []).filter(w => (w.text || '').trim() && (opts.floor <= 0 || sure(w)));
            if (!(l.words || []).length) return (opts.floor <= 0 || sure(l)) ? l : null;
            if (!kept.length) return null;
            const b = kept.reduce((acc, w) => {
              const q = w.bbox || w;
              return { x0: Math.min(acc.x0, q.x0), y0: Math.min(acc.y0, q.y0),
                       x1: Math.max(acc.x1, q.x1), y1: Math.max(acc.y1, q.y1) };
            }, { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
            return { text: kept.map(w => w.text).join(' '), bbox: b, confidence: l.confidence };
          }).filter(Boolean);
          p.text = p.lines.map(l => l.text).join('\n').trim() || (data.text || '').trim();
          p.state = p.words.length + ' words';
        }
        done++;
        progress(done / total);
        sheet(); paintAll();
      }
      progress(null);
      const read = pages.reduce((a, p) => a + (p.words ? p.words.length : 0), 0);
      const skipped = pages.filter(p => p.state === 'already searchable').length;
      const binned = pages.reduce((a, p) => a + (p.dropped || 0), 0);
      note = h('p', { class: 'hint', style: 'margin-top:10px' }, read
        ? `${read.toLocaleString()} words recognised` + (binned ? `, ${binned} too unclear to trust` : '') +
          (skipped ? `, ${skipped} page${skipped === 1 ? '' : 's'} already had text` : '') +
          (shrunk ? `. ${shrunk} page${shrunk === 1 ? ' was' : 's were'} read at a lower resolution than asked for — this browser will not make a bitmap that large` : '') +
          '. Drag across the page to select.'
        : `Every page already carries its own text, so there was nothing to recognise. Select and copy from the page, or take the text out with Save .txt.`);
      saveBtn.disabled = !read;
      txtBtn.disabled = copyBtn.disabled = !pages.some(p => p.text);
    } catch (e) {
      progress(null);
      console.error(e);
      await ocrRelease();
      if (!alive()) { running = false; return; }
      const d = (typeof pre !== 'undefined' && pre && pre.wasm) ? pre : await ocrDiagnose().catch(() => ({}));
      const bad = d.wasm && d.wasm !== 'ok' ? 'WebAssembly is switched off in this view'
        : d.worker && d.worker !== 'ok' ? 'background workers are switched off in this view'
        : d.model && !/^ok/.test(d.model || '') ? 'the English model could not be fetched'
        : 'the engine failed to start';
      note = h('div', { style: 'margin-top:10px' },
        h('p', { style: 'color:var(--mark);font-size:12.5px' }, 'OCR could not run here \u2014 ' + bad + '.'),
        h('p', { class: 'hint', style: 'margin-top:6px' },
          'Recognition needs WebAssembly and a worker. Everything else in Paperless works without them, which is why only this tool is affected. The same page served from your own machine has neither restriction.'),
        h('p', { class: 'mono', style: 'font-size:11px;color:var(--ink-3);margin-top:8px;white-space:pre-wrap;word-break:break-word' },
          'worker: ' + (d.worker || '?') + '\nwasm:   ' + (d.wasm || '?') + '\nmodel:  ' + (d.model || '?') +
          '\npaths:  ' + (d.base || '?') +
          '\nthrew:  ' + String(e && e.message || e).slice(0, 160)));
      toast('OCR could not run here.', true);
    } finally {
      /* in a finally, so the early returns that bail out of a cancelled run
         cannot leave the tool thinking it is still reading */
      running = false;
      if (alive()) panel();
    }
  }

  function paintAll() { pages.forEach(paintWords); }

  /* ---- write the words back into the PDF, invisibly ---- */
  async function saveSearchable() {
    const { PDFDocument: PD, StandardFonts: SF, setTextRenderingMode, TextRenderingMode,
      pushGraphicsState, popGraphicsState } = PDFLib;
    try {
      progress(0.05);
      const pdf = await PD.load(S.doc.bytes.slice(0), { ignoreEncryption: true });
      const font = await pdf.embedFont(SF.Helvetica);
      const list = pdf.getPages();
      let written = 0;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (!p.words || !p.words.length) continue;
        const page = list[i];
        if (!page) continue;
        /* The boxes are in the recogniser's image pixels, which came from a
           pdf.js viewport — so they are in the page's CROP box, already turned
           the right way up by its /Rotate. The invisible text has to be laid
           back into PDF user space, which is neither: scanner output very often
           carries /Rotate 90, and writing the words straight out left them
           transposed and mostly off the sheet, so a search found nothing. Same
           transform the editor's own export uses. */
        const crop = pageCrop(page);
        const R = ((page.getRotation().angle % 360) + 360) % 360;
        const W = crop.width, H = crop.height;
        const place = (dx, dy, dh) => {
          let q;
          if (R === 90) q = { x: dy + dh, y: dx };
          else if (R === 180) q = { x: W - dx, y: dy + dh };
          else if (R === 270) q = { x: W - dy - dh, y: H - dx };
          else q = { x: dx, y: H - dy - dh };
          return { x: q.x + crop.x, y: q.y + crop.y };
        };
        const k = p.ptW / p.px;                 // image pixels -> PDF points
        page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
        for (const w of p.words) {
          const t = toWinAnsi((w.text || '').trim()).text || '';
          if (!t) continue;
          const b = w.bbox || w;
          const bw = (b.x1 - b.x0) * k, bh = (b.y1 - b.y0) * k;
          if (bw < 0.6 || bh < 0.6) continue;
          const unit = font.widthOfTextAtSize(t, 100) / 100;
          let size = unit > 0.01 ? bw / unit : bh;
          size = clamp(size, Math.max(1, bh * 0.45), bh * 1.6);
          const at = place(b.x0 * k, b.y1 * k - bh * 0.18, 0);
          page.drawText(t, { x: at.x, y: at.y, size, font, rotate: degrees(R) });
          written++;
        }
        page.pushOperators(popGraphicsState());
        progress(0.05 + 0.9 * ((i + 1) / pages.length));
      }
      const bytes = await pdf.save();
      progress(null);
      if (!written) return toast('Nothing recognised to write.', true);
      await offerFile(outName(S.doc.name, '-searchable', '.pdf'), bytes);
    } catch (e) {
      progress(null);
      console.error(e);
      toast('Could not write the searchable file.', true);
    }
  }

  panel();
  clear(stage).append(h('div', { class: 'empty' }, h('div', { class: 'inner' },
    ico('scan'),
    h('h3', null, 'Read the words off the page'),
    h('p', null, 'Runs the recogniser over every page, then lets you select and copy the text — and save a PDF that any reader can search.'),
    h('button', { class: 'btn primary', onclick: () => start() }, ico('check'), 'Read the document'))));
}

/* ============================================================ sample file */
async function loadSample() {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.1, 0.13), soft = rgb(0.42, 0.46, 0.52), rule = rgb(0.84, 0.86, 0.89);
  const W = 595.28, H = 841.89, M = 62;

  const header = (pg, label) => {
    pg.drawText('NORTHWIND SURVEY CO.', { x: M, y: H - M, size: 9, font: bold, color: soft });
    pg.drawText(label, { x: W - M - helv.widthOfTextAtSize(label, 9), y: H - M, size: 9, font: helv, color: soft });
    pg.drawLine({ start: { x: M, y: H - M - 10 }, end: { x: W - M, y: H - M - 10 }, thickness: 0.7, color: rule });
  };
  const footer = (pg, n) => {
    pg.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 0.7, color: rule });
    pg.drawText('Ref. NW-2214 · Issued 12 September 2026', { x: M, y: 50, size: 8, font: helv, color: soft });
    const s = 'Page ' + n + ' of 3';
    pg.drawText(s, { x: W - M - helv.widthOfTextAtSize(s, 8), y: 50, size: 8, font: helv, color: soft });
  };

  // Page 1
  let pg = doc.addPage([W, H]);
  header(pg, 'Site survey report');
  pg.drawText('Site survey: Pier 4 warehouse', { x: M, y: H - 150, size: 24, font: bold, color: ink });
  pg.drawText('Conducted 9–11 September 2026', { x: M, y: H - 176, size: 11, font: helv, color: soft });
  const para = [
    'This report covers the structural and services survey carried out at the Pier 4',
    'warehouse ahead of the proposed fit-out. Three areas were inspected: the main',
    'floor slab, the roof deck above bays 2 and 3, and the incoming electrical supply.',
    '',
    'Two findings require attention before any fit-out begins. The slab shows surface',
    'cracking along the eastern expansion joint, and the supply capacity is below what',
    'the proposed plant schedule requires. Neither is unusual for a building of this age.',
    '',
    'Recommendations and costings are set out on page 2. Sign-off is on page 3.'
  ];
  para.forEach((l, i) => pg.drawText(l, { x: M, y: H - 220 - i * 17, size: 11, font: helv, color: ink }));
  footer(pg, 1);

  // Page 2
  pg = doc.addPage([W, H]);
  header(pg, 'Findings and costings');
  pg.drawText('Findings', { x: M, y: H - 130, size: 17, font: bold, color: ink });
  const rows = [
    ['Ref', 'Item', 'Priority', 'Estimate'],
    ['1.1', 'Eastern expansion joint — resin injection', 'High', '4,200'],
    ['1.2', 'Slab surface grind, bays 2–3', 'Medium', '2,650'],
    ['2.1', 'Roof deck fixings, 18 off', 'Medium', '1,180'],
    ['2.2', 'Gutter outlet replacement', 'Low', '640'],
    ['3.1', 'Supply upgrade, 100A to 200A', 'High', '11,400'],
    ['3.2', 'Distribution board relocation', 'Medium', '3,900']
  ];
  const cols = [M, M + 46, M + 300, M + 400];
  rows.forEach((r, i) => {
    const y = H - 165 - i * 22;
    const f = i === 0 ? bold : helv;
    if (i === 0) pg.drawLine({ start: { x: M, y: y - 7 }, end: { x: W - M, y: y - 7 }, thickness: 0.7, color: rule });
    else if (i % 2 === 0) pg.drawRectangle({ x: M - 6, y: y - 6, width: W - 2 * M + 12, height: 20, color: rgb(.965, .972, .98) });
    r.forEach((cell, c) => {
      const x = c === 3 ? cols[3] + 70 - f.widthOfTextAtSize(cell, 10) : cols[c];
      pg.drawText(cell, { x, y, size: 10, font: f, color: c === 2 && cell === 'High' ? rgb(.73, .13, .35) : ink });
    });
  });
  const total = '23,970';
  pg.drawLine({ start: { x: M, y: H - 165 - rows.length * 22 + 8 }, end: { x: W - M, y: H - 165 - rows.length * 22 + 8 }, thickness: 0.7, color: rule });
  pg.drawText('Total, excluding VAT', { x: M, y: H - 165 - rows.length * 22 - 12, size: 10, font: bold, color: ink });
  pg.drawText(total, { x: cols[3] + 70 - bold.widthOfTextAtSize(total, 10), y: H - 165 - rows.length * 22 - 12, size: 10, font: bold, color: ink });
  footer(pg, 2);

  // Page 3
  pg = doc.addPage([W, H]);
  header(pg, 'Approval');
  pg.drawText('Approval', { x: M, y: H - 130, size: 17, font: bold, color: ink });
  const note = [
    'By signing below, the client confirms the findings on page 2 have been read and',
    'authorises the high-priority items (1.1 and 3.1) to proceed to tender.'
  ];
  note.forEach((l, i) => pg.drawText(l, { x: M, y: H - 162 - i * 17, size: 11, font: helv, color: ink }));
  const lines = [['Client signature', 430], ['Name in capitals', 360], ['Date', 290]];
  lines.forEach(([label, y]) => {
    pg.drawLine({ start: { x: M, y }, end: { x: M + 300, y }, thickness: 0.8, color: rgb(.6, .64, .7) });
    pg.drawText(label, { x: M, y: y - 14, size: 9, font: helv, color: soft });
  });
  pg.drawText('Surveyor: A. Whitlock MRICS', { x: M, y: 210, size: 10, font: helv, color: soft });
  footer(pg, 3);

  const bytes = await doc.save();
  await setDoc(bytes, 'pier-4-survey.pdf');
  updateMeta();
}

/* ---------------------------------------------------------- brand lockup

   The byline sits under the wordmark and is spaced out to finish exactly where
   it finishes — never past it. The web font decides the real widths, so this is
   measured rather than guessed, and re-measured when the font arrives. */
function fitBrand() {
  const word = $('#brand-word'), by = $('#brand-by');
  if (!word || !by) return;
  by.style.letterSpacing = '0px';
  by.style.marginRight = '0px';
  by.style.fontSize = '';
  const target = word.getBoundingClientRect().width;
  let natural = by.getBoundingClientRect().width;
  if (!target || !natural) return;
  if (natural > target) {                       // too wide even unspaced: shrink
    const size = parseFloat(getComputedStyle(by).fontSize) * (target / natural);
    by.style.fontSize = Math.max(6, size).toFixed(2) + 'px';
    natural = by.getBoundingClientRect().width;
  }
  const n = by.textContent.length;
  if (n < 2) return;
  /* Spread the slack over every gap AND the trailing one, then pull the
     trailing one back off the box: the last glyph then lands just inside the
     wordmark's right edge rather than exactly on it. */
  const extra = (target - natural) / n;
  if (extra > 0.01) {
    by.style.letterSpacing = extra.toFixed(3) + 'px';
    by.style.marginRight = (-extra).toFixed(3) + 'px';   // drop the trailing gap
  }
}

/* ------------------------------------------------------------------- boot */
function boot() {
  buildHome();
  /* The renderer's worker is a separate 1.1 MB file that pdf.js only asks for
     when the first document opens — so a page that had been loaded but never
     used would still need the network. Pull it in now and keep it as a blob in
     memory, which no cache policy and no offline switch can take away. */
  try {
    fetch('lib/pdf.worker.min.js')
      .then(r => r.ok ? r.blob() : null)
      .then(b => { if (b) pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(b); })
      .catch(() => {});
  } catch (e) {}
  fitBrand();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitBrand).catch(() => {});
  window.addEventListener('resize', fitBrand);

  $('#home-link').addEventListener('click', showHome);
  $('#home-link').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showHome(); } });
  $('#wb-back').addEventListener('click', showHome);
  $('#wb-sidetoggle').addEventListener('click', () => {
    S.sideClosed = !S.sideClosed;
    const btn = $('#wb-sidetoggle');
    btn.setAttribute('aria-pressed', S.sideClosed);
    btn.title = S.sideClosed ? 'Show the panel' : 'Hide the panel';
    applySidePanel();
  });

  const go = async files => {
    const f = files[0];
    if (!f) return;
    if (await openPdfFile(f)) openTool('edit');
  };
  dropTarget($('#home-drop'), go);
  $('#home-pick').addEventListener('click', async () => { const f = await pickFile('.pdf'); if (f) go([f]); });
  $('#home-sample').addEventListener('click', async () => {
    try { await loadSample(); openTool('edit'); toast('Sample document opened — try Stamp & sign on page 3'); }
    catch (e) { console.error('sample build failed', e); toast('Could not build the sample.', true); }
  });

  document.addEventListener('keydown', e => {
    if ($('#view-tool').hidden) return;
    const typing = /input|textarea/i.test(e.target.tagName) || e.target.isContentEditable;
    if (typing) return;
    /* These used to reach for the first two buttons in the action bar, which is
       only undo and redo in the editor. In Split the first button is "Split &
       save"; in the reader it is Copy, so Cmd+Z replaced the clipboard and
       Cmd+Shift+Z downloaded a text file. The tool now says what it offers, and
       a tool that offers nothing gets nothing. */
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      const act = S.keys && (e.shiftKey ? S.keys.redo : S.keys.undo);
      if (act) { e.preventDefault(); act(); }
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && S.sel && S.keys && S.keys.remove) {
      e.preventDefault();
      S.keys.remove();
    }
    if (e.key === 'Escape') showHome();
  });
}


/* ========================================= ink from a photograph of paper

   Ported from Ink & Seal (Monkey Marxist, AGPL-3.0). Photograph a signature or
   a rubber stamp on white paper and this turns it into transparent ink: the
   paper goes, the strokes keep their own colour, and what is left can be put on
   a page without a white box around it.

   The matte is the interesting part. A global threshold fails on a phone photo
   because one corner of the page is always brighter than the other, so the
   paper colour is estimated per tile and interpolated across the sheet. Each
   pixel is then normalised against its local paper colour and the compositing
   equation C = (1-a) + a*ink is solved for a and for the ink colour — which is
   what stops fine strokes coming out with a white fringe, as they do when you
   simply knock out everything near white. */

function removePaper(source, cleanup = 12, strength = 1) {
  const { width: w, height: h, data: src } = source;
  const tile = Math.max(32, Math.round(Math.max(w, h) / 18));
  const nx = Math.ceil(w / tile), ny = Math.ceil(h / tile);
  const paper = new Float32Array(nx * ny * 3);
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < nx; gx++) {
    const samples = [];
    for (let y = gy * tile; y < Math.min(h, (gy + 1) * tile); y += 3) {
      for (let x = gx * tile; x < Math.min(w, (gx + 1) * tile); x += 3) {
        const i = (y * w + x) * 4;
        if (src[i + 3] < 240) continue;
        samples.push({ i, light: 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2] });
      }
    }
    samples.sort((a, b) => b.light - a.light);
    const count = Math.max(1, Math.ceil(samples.length * 0.18)), o = (gy * nx + gx) * 3;
    if (!samples.length) { paper[o] = paper[o + 1] = paper[o + 2] = 255; continue; }
    for (let j = 0; j < count; j++) for (let c = 0; c < 3; c++) paper[o + c] += src[samples[j].i + c] / count;
  }
  /* A local maximum over the tile grid, so a tile that happens to be filled
     with dense ink does not decide that ink is what paper looks like. */
  const expanded = new Float32Array(paper.length);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) for (let c = 0; c < 3; c++) {
    let best = 96;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(nx - 1, Math.max(0, x + dx)), yy = Math.min(ny - 1, Math.max(0, y + dy));
      best = Math.max(best, paper[(yy * nx + xx) * 3 + c]);
    }
    expanded[(y * nx + x) * 3 + c] = best;
  }
  const out = new Uint8ClampedArray(src.length), cutoff = cleanup / 100 * 0.30;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(ny - 1, y / tile - 0.5)), y0 = Math.floor(fy), y1 = Math.min(ny - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) continue;
      const fx = Math.max(0, Math.min(nx - 1, x / tile - 0.5)), x0 = Math.floor(fx), x1 = Math.min(nx - 1, x0 + 1), tx = fx - x0;
      const normalized = [];
      for (let c = 0; c < 3; c++) {
        const top = expanded[(y0 * nx + x0) * 3 + c] * (1 - tx) + expanded[(y0 * nx + x1) * 3 + c] * tx;
        const bottom = expanded[(y1 * nx + x0) * 3 + c] * (1 - tx) + expanded[(y1 * nx + x1) * 3 + c] * tx;
        normalized[c] = Math.min(1, src[i + c] / Math.max(96, top * (1 - ty) + bottom * ty));
      }
      const density = 1 - Math.min(...normalized), matte = Math.max(0, (density - cutoff) / (1 - cutoff));
      const alpha = Math.min(1, matte * strength) * src[i + 3] / 255;
      if (alpha < 1 / 255) continue;
      for (let c = 0; c < 3; c++) {
        out[i + c] = 255 * Math.min(1, Math.max(0, (normalized[c] - (1 - density)) / Math.max(density, 0.001)));
      }
      out[i + 3] = Math.round(alpha * 255);
      if (alpha > 0.015) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    }
  }
  if (maxX < minX || maxY < minY) return { width: 1, height: 1, offsetX: 0, offsetY: 0, image: new ImageData(1, 1), empty: true };
  const pad = Math.max(3, Math.round(Math.max(maxX - minX, maxY - minY) * 0.012));
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const width = maxX - minX + 1, height = maxY - minY + 1;
  const trimmed = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    trimmed.set(out.subarray(((y + minY) * w + minX) * 4, ((y + minY) * w + minX + width) * 4), y * width * 4);
  }
  return { width, height, offsetX: minX, offsetY: minY, image: new ImageData(trimmed, width, height), empty: false };
}

/* Brightness, contrast, saturation and sharpness applied to the INK rather than
   to the picture: the work is done on ink density, so a fully clear pixel stays
   clear and the edges of a stroke do not grow a halo. */
function adjustInk(source, options = {}) {
  const brightness = clamp(options.brightness == null ? 0 : options.brightness, -50, 50);
  const contrast = clamp(options.contrast == null ? 100 : options.contrast, 50, 200) / 100;
  const saturation = clamp(options.saturation == null ? 100 : options.saturation, 0, 200) / 100;
  const sharpness = clamp(options.sharpness == null ? 0 : options.sharpness, 0, 100) / 100;
  const { width, height, data } = source;
  if (!brightness && contrast === 1 && saturation === 1 && !sharpness) {
    return new ImageData(new Uint8ClampedArray(data), width, height);
  }
  const densities = new Float32Array(width * height * 3);
  const lightness = Math.pow(2, -brightness / 50);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4, a = data[i + 3] / 255;
    if (!a) continue;
    const grey = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    for (let c = 0; c < 3; c++) {
      const colour = clamp(grey + (data[i + c] / 255 - grey) * saturation, 0, 1);
      densities[pixel * 3 + c] = Math.min(1, Math.pow(a * (1 - colour), 1 / contrast) * lightness);
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = y * width + x, i = pixel * 4;
    if (!data[i + 3]) continue;
    const d = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      let value = densities[pixel * 3 + c];
      if (sharpness) {
        let blurred = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx)), yy = Math.min(height - 1, Math.max(0, y + dy));
          blurred += densities[(yy * width + xx) * 3 + c] / 9;
        }
        value += 1.5 * sharpness * (value - blurred);
      }
      d[c] = clamp(value, 0, 1);
    }
    const a = Math.max(...d);
    if (a < 1 / 255) continue;
    out[i + 3] = Math.round(a * 255);
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(255 * (1 - d[c] / a));
  }
  return new ImageData(out, width, height);
}

/* ---- the saved ink library ----------------------------------------------

   Kept in this browser, like everything else here: IndexedDB on this origin,
   never sent anywhere. If storage is refused — a private window, a locked-down
   profile — the library still works for the session and says so. */

let INK_DB = null;
function inkDb() {
  if (INK_DB) return INK_DB;
  INK_DB = new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('no indexedDB'));
    let req;
    try { req = indexedDB.open('paperless-ink', 1); } catch (e) { return reject(e); }
    req.onupgradeneeded = () => { try { req.result.createObjectStore('ink', { keyPath: 'id' }); } catch (e) {} };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('blocked'));
    req.onblocked = () => reject(new Error('blocked'));
  });
  INK_DB.catch(() => { INK_DB = null; });
  return INK_DB;
}
async function inkStore(action, value) {
  const db = await inkDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ink', action === 'getAll' ? 'readonly' : 'readwrite');
    const req = tx.objectStore('ink')[action](value);
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('could not save'));
  });
}
async function loadInkLibrary() {
  try {
    const rows = await inkStore('getAll');
    S.ink = (rows || []).sort((a, b) => a.created - b.created);
  } catch (e) {
    S.ink = [];
    S.inkVolatile = true;
  }
  return S.ink;
}

/* A saved item is a PNG data URL. The exporter wants real bytes, so decode it
   once, here, rather than at save time — the bytes are what goes into the PDF
   and the data URL is what the thumbnail and the page preview use. */
function inkBytes(asset) {
  if (asset._bytes) return asset._bytes;
  /* Decoded by hand rather than with fetch(). A data: URL is not a network
     resource, but fetch still goes through the page's connect-src policy, and
     in a sandboxed frame that refusal is what made every saved signature fail
     to place with "that saved ink could not be read". atob has no such
     problem, and for a 60 KB PNG it is quicker anyway. */
  const url = String(asset.data || '');
  const comma = url.indexOf(',');
  if (!/^data:/i.test(url) || comma < 0) throw new Error('not a data URL');
  const body = url.slice(comma + 1);
  let bin;
  if (/;base64/i.test(url.slice(0, comma))) bin = atob(body);
  else bin = decodeURIComponent(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  asset._bytes = bytes;
  return bytes;
}

/* ---- the capture dialog --------------------------------------------------

   Photograph → crop → matte → tidy up → save. The preview is recomputed on a
   short timer rather than on every slider tick, because the matte is a full
   pass over the photograph and a 12 megapixel phone picture is not free. The
   expensive part is cached against its inputs, so moving a colour slider does
   not redo the paper estimation. */

function sealDialog(kind, onSaved) {
  let source = null;              // ImageData of the photograph
  let crop = null;                // {x,y,width,height} in source pixels
  let matte = null;               // cache of the paper-removal result
  let preview = null;             // ImageData currently on screen
  let origin = { x: 0, y: 0 };    // where the preview sits in the source
  let result = null;              // {data,width,height} ready to save
  let mask = null;                // eraser: 255 keep, 0 erased, per source pixel
  let strokes = [], erased = 0, erasing = false, timer = null, frame = null;

  const opts = { cleanup: 12, strength: 100, brightness: 0, contrast: 100, saturation: 100, sharpness: 0 };
  const DEFAULTS = { brightness: 0, contrast: 100, saturation: 100, sharpness: 0 };

  const srcCanvas = h('canvas');
  const outCanvas = h('canvas');
  const cropBox = h('div', { class: 'inkcrop', hidden: true });
  const brush = h('span', { class: 'inkbrush', hidden: true });
  const status = h('p', { class: 'hint', style: 'min-height:32px' }, 'Upload a photo to begin.');
  const nameField = h('input', { type: 'text', maxlength: '60', placeholder: 'My signature' });
  const saveBtn = h('button', { class: 'btn primary', disabled: true }, ico('save'), 'Save');
  const resetCrop = h('button', { class: 'linkbtn', hidden: true, onclick: () => { crop = null; cropBox.hidden = true; resetCrop.hidden = true; run(); } }, 'Reset crop');
  const zoom = h('select', { onchange: sizeOut },
    h('option', { value: 'fit', selected: true }, 'Fit'), h('option', { value: '1' }, '100%'),
    h('option', { value: '2' }, '200%'), h('option', { value: '4' }, '400%'));
  const eraseBtn = h('button', { class: 'btn sm', 'aria-pressed': 'false', onclick: toggleEraser }, ico('rub'), 'Eraser');
  const brushSize = h('input', { type: 'range', min: '1', max: '80', value: '12' });
  const undoErase = h('button', { class: 'btn sm', disabled: true, onclick: popStroke }, ico('undo'));
  const restoreInk = h('button', { class: 'btn sm', disabled: true, onclick: () => { if (mask) mask.fill(255); strokes = []; erased = 0; run(); } }, 'Restore');
  const outWrap = h('div', { class: 'inkout checker' }, h('div', { class: 'inkout-in' }, outCanvas, brush));
  const srcWrap = h('div', { class: 'inksrc' }, srcCanvas, cropBox);

  let inkKind = kind === 'stamp' ? 'stamp' : 'signature';
  /* as strings: h() drops an attribute whose value is false, and the pressed
     styling is keyed on [aria-pressed="true"] */
  const kindSeg = h('div', { class: 'seg' },
    h('button', { 'aria-pressed': String(inkKind === 'signature'), onclick: () => setKind('signature') }, 'Signature'),
    h('button', { 'aria-pressed': String(inkKind === 'stamp'), onclick: () => setKind('stamp') }, 'Stamp'));
  function setKind(k) {
    inkKind = k;
    for (const b of kindSeg.children) b.setAttribute('aria-pressed', String(b.textContent.toLowerCase() === k));
    if (!nameField.value.trim() || /^My (signature|stamp)/.test(nameField.value)) nameField.value = defaultName();
  }
  const defaultName = () => {
    const n = (S.ink || []).filter(a => a.kind === inkKind).length;
    return 'My ' + inkKind + (n ? ' ' + (n + 1) : '');
  };

  function slider(label, key, min, max, suffix, note) {
    const out = h('span', { class: 'val' }, opts[key] + (suffix || ''));
    const input = h('input', {
      type: 'range', min: String(min), max: String(max), value: String(opts[key]),
      oninput: e => { opts[key] = +e.target.value; out.textContent = opts[key] + (suffix || ''); schedule(); }
    });
    return h('div', { class: 'field' }, h('label', null, label),
      h('div', { class: 'rangerow' }, input, out),
      note ? h('span', { class: 'hint' }, note) : null);
  }

  const picker = h('div', { class: 'inkpick' },
    ico('scan'),
    h('h3', null, 'Start with a photo, or draw it'),
    h('p', null, 'A signature or a stamp on white paper. Even light, no shadow across it, and the whole mark in the frame. Or draw your signature here with a finger, a pencil or the mouse.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', 'data-pick': 'file', onclick: () => pick(false) }, ico('image'), 'Choose a photo'),
      h('button', { class: 'btn', 'data-pick': 'camera', onclick: () => pick(true) }, 'Take a photo'),
      h('button', {
        class: 'btn', 'data-pick': 'draw',
        onclick: () => {
          /* The pad is a separate sheet, so this one steps aside first — two
             stacked modals share one overlay and the lower one would be stuck
             open behind the pad. */
          const pad = S.drawSignature;
          if (!pad) return toast('Open a document first, then draw your signature.', true);
          if (close) close();
          pad();
        }
      }, ico('sign'), 'Draw')),
    h('p', { class: 'hint', style: 'margin-top:12px' }, 'Nothing you draw or photograph here leaves this tab.'));

  const editor = h('div', { hidden: true },
    h('div', { class: 'inkgrid' },
      h('div', null,
        h('div', { class: 'inklabel' }, h('span', null, 'Photo'), resetCrop),
        srcWrap,
        h('p', { class: 'hint' }, 'Drag across the photo to crop to the mark.')),
      h('div', null,
        h('div', { class: 'inklabel' }, h('span', null, 'Transparent ink'),
          h('label', { class: 'inkzoom' }, 'Zoom', zoom)),
        outWrap,
        status)),
    h('div', { class: 'inkrow2' },
      slider('Paper cleanup', 'cleanup', 0, 65, '', 'Raise it to clear faint shadows and show-through.'),
      slider('Ink strength', 'strength', 60, 160, '%', 'Leave at 100% for the ink as photographed.')),
    h('div', { class: 'inkerase' },
      eraseBtn,
      h('label', null, 'Brush', brushSize),
      undoErase, restoreInk,
      h('p', { class: 'hint' }, 'Turn the eraser on and brush over anything the matte left behind — a ruled line, a crease, a speck.')),
    h('details', { class: 'inkadj' },
      h('summary', null, 'Colour and detail'),
      h('div', { class: 'inkrow2' },
        slider('Brightness', 'brightness', -50, 50, ''),
        slider('Contrast', 'contrast', 50, 200, '%'),
        slider('Saturation', 'saturation', 0, 200, '%'),
        slider('Sharpness', 'sharpness', 0, 100, '')),
      h('button', {
        class: 'linkbtn', onclick: () => {
          Object.assign(opts, DEFAULTS);
          const ranges = editor.querySelectorAll('.inkadj input[type=range]');
          const keys = ['brightness', 'contrast', 'saturation', 'sharpness'];
          ranges.forEach((r, i) => {
            r.value = String(DEFAULTS[keys[i]]);
            const v = r.parentNode.querySelector('.val');
            if (v) v.textContent = DEFAULTS[keys[i]] + (['contrast', 'saturation'].includes(keys[i]) ? '%' : '');
          });
          run();
        }
      }, 'Reset colour and detail')),
    h('div', { class: 'field' }, h('label', null, 'Kind'), kindSeg),
    h('div', { class: 'field' }, h('label', null, 'Name'), nameField));

  let close = null;
  close = modal(box => {
    box.classList.add('wide');
    box.append(
      h('h3', null, 'Stamp & sign'),
      h('p', null, 'Turn a photograph of a signature or a rubber stamp into transparent ink you can place on any page.'),
      picker, editor,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => pick(false) }, 'Change photo'),
        h('button', { class: 'btn', onclick: () => close && close() }, 'Cancel'),
        saveBtn));
    saveBtn.onclick = save;
  }, () => { clearTimeout(timer); if (frame) cancelAnimationFrame(frame); });

  /* ---- loading a photograph ---- */
  async function pick(camera) {
    const input = $('#filein');
    if (camera) input.setAttribute('capture', 'environment'); else input.removeAttribute('capture');
    const f = await pickFile('image/png,image/jpeg,image/webp');
    input.removeAttribute('capture');
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(png|jpe?g|webp)$/i.test(f.name)) return toast('Choose a JPG, PNG or WebP photo.', true);
    const url = URL.createObjectURL(f);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      if (!im.naturalWidth || !im.naturalHeight) throw new Error('empty');
      // 2400px on the long edge is plenty for a signature and keeps the matte quick
      const k = Math.min(1, 2400 / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(im.naturalWidth * k);
      cv.height = Math.round(im.naturalHeight * k);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(im, 0, 0, cv.width, cv.height);
      source = cx.getImageData(0, 0, cv.width, cv.height);
      crop = null; matte = null; strokes = []; erased = 0;
      mask = new Uint8Array(cv.width * cv.height).fill(255);
      srcCanvas.width = cv.width; srcCanvas.height = cv.height;
      srcCanvas.getContext('2d').putImageData(source, 0, 0);
      cropBox.hidden = true; resetCrop.hidden = true;
      picker.hidden = true; editor.hidden = false;
      nameField.value = defaultName();
      run();
    } catch (e) {
      console.error(e);
      toast('That image could not be read. Try a JPG or PNG.', true);
    } finally { URL.revokeObjectURL(url); }
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 60); };

  function run() {
    if (!source) return;
    const key = JSON.stringify(crop);
    if (!matte || matte.key !== key || matte.cleanup !== opts.cleanup || matte.strength !== opts.strength) {
      let image = source;
      if (crop) {
        const cv = document.createElement('canvas');
        cv.width = source.width; cv.height = source.height;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.putImageData(source, 0, 0);
        image = cx.getImageData(crop.x, crop.y, crop.width, crop.height);
      }
      matte = { key, cleanup: opts.cleanup, strength: opts.strength, out: removePaper(image, opts.cleanup, opts.strength / 100) };
    }
    const m = matte.out;
    preview = adjustInk(m.image, opts);
    origin = { x: (crop ? crop.x : 0) + m.offsetX, y: (crop ? crop.y : 0) + m.offsetY };
    let left = 0;
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      const i = (y * m.width + x) * 4;
      if (mask && !mask[(y + origin.y) * source.width + x + origin.x]) preview.data[i + 3] = 0;
      if (preview.data[i + 3]) left++;
    }
    outCanvas.width = m.width; outCanvas.height = m.height;
    outCanvas.getContext('2d').putImageData(preview, 0, 0);
    result = (m.empty || !left) ? null : { data: outCanvas.toDataURL('image/png'), width: m.width, height: m.height };
    sizeOut();
    saveBtn.disabled = !result;
    undoErase.disabled = !strokes.length;
    restoreInk.disabled = !erased;
    status.textContent = m.empty ? 'No ink found. Lower the paper cleanup, or try a clearer photo.'
      : !left ? 'Everything has been erased. Undo a stroke, or restore the ink.'
      : erasing ? 'Brush over anything that should not be there.'
      : 'Paper removed, ink colour kept. ' + m.width + ' × ' + m.height + ' px.';
  }

  function sizeOut() {
    const z = zoom.value === 'fit'
      ? Math.min(1, (outWrap.clientWidth - 28) / Math.max(1, outCanvas.width), (outWrap.clientHeight - 28) / Math.max(1, outCanvas.height))
      : +zoom.value;
    outCanvas.style.width = Math.max(1, outCanvas.width * z) + 'px';
    outCanvas.style.height = Math.max(1, outCanvas.height * z) + 'px';
  }

  /* ---- cropping ---- */
  srcWrap.addEventListener('pointerdown', e => {
    if (!source || e.button !== 0) return;
    e.preventDefault();
    const bounds = srcCanvas.getBoundingClientRect(), wrap = srcWrap.getBoundingClientRect();
    const at = ev => ({ x: clamp((ev.clientX - bounds.left) / bounds.width, 0, 1), y: clamp((ev.clientY - bounds.top) / bounds.height, 0, 1) });
    const a = at(e);
    let b = a;
    const show = () => {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), hh = Math.abs(b.y - a.y);
      Object.assign(cropBox.style, {
        left: (bounds.left - wrap.left + x * bounds.width) + 'px',
        top: (bounds.top - wrap.top + y * bounds.height) + 'px',
        width: (w * bounds.width) + 'px', height: (hh * bounds.height) + 'px'
      });
      cropBox.hidden = false;
    };
    captureGesture(srcWrap, e, {
      move: ev => { b = at(ev); show(); },
      end: ev => {
        b = at(ev);
        if (Math.abs(b.x - a.x) * bounds.width < 8 || Math.abs(b.y - a.y) * bounds.height < 8) { cropBox.hidden = true; return; }
        const x = Math.floor(Math.min(a.x, b.x) * source.width), y = Math.floor(Math.min(a.y, b.y) * source.height);
        crop = {
          x, y,
          width: Math.max(1, Math.min(source.width - x, Math.round(Math.abs(b.x - a.x) * source.width))),
          height: Math.max(1, Math.min(source.height - y, Math.round(Math.abs(b.y - a.y) * source.height)))
        };
        show(); resetCrop.hidden = false; run();
      },
      cancel: () => { cropBox.hidden = true; }
    });
  });

  /* ---- the eraser ---- */
  function toggleEraser() {
    erasing = !erasing;
    eraseBtn.setAttribute('aria-pressed', String(erasing));
    outWrap.classList.toggle('erasing', erasing);
    brush.hidden = true;
    run();
  }
  function popStroke() {
    if (!strokes.length || !mask) return;
    const s = strokes.pop();
    for (const i of s) mask[i] = 255;
    erased -= s.length;
    run();
  }
  outCanvas.addEventListener('pointermove', e => {
    if (!erasing || !preview) return;
    const r = outCanvas.getBoundingClientRect(), host = outWrap.getBoundingClientRect();
    const d = Math.max(2, +brushSize.value * r.width / Math.max(1, outCanvas.width));
    Object.assign(brush.style, { left: (e.clientX - host.left + outWrap.scrollLeft) + 'px', top: (e.clientY - host.top + outWrap.scrollTop) + 'px', width: d + 'px', height: d + 'px' });
    brush.hidden = false;
  });
  outCanvas.addEventListener('pointerleave', () => { brush.hidden = true; });
  outCanvas.addEventListener('pointerdown', e => {
    if (!erasing || !mask || !preview || e.button !== 0) return;
    e.preventDefault();
    const rect = outCanvas.getBoundingClientRect();
    const at = ev => ({ x: (ev.clientX - rect.left) / rect.width * outCanvas.width, y: (ev.clientY - rect.top) / rect.height * outCanvas.height });
    const radius = +brushSize.value / 2, touched = new Set();
    let last = at(e);
    const dab = p => {
      const x0 = Math.max(0, Math.floor(p.x - radius)), x1 = Math.min(outCanvas.width - 1, Math.ceil(p.x + radius));
      const y0 = Math.max(0, Math.floor(p.y - radius)), y1 = Math.min(outCanvas.height - 1, Math.ceil(p.y + radius));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (radius > 0.5 && (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2 > radius * radius) continue;
        if (radius <= 0.5 && (x !== Math.floor(p.x) || y !== Math.floor(p.y))) continue;
        const i = (y + origin.y) * source.width + x + origin.x;
        if (mask[i]) { touched.add(i); mask[i] = 0; erased++; }
        preview.data[(y * outCanvas.width + x) * 4 + 3] = 0;
      }
    };
    dab(last);
    captureGesture(outCanvas, e, {
      move: ev => {
        const p = at(ev);
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - last.x, p.y - last.y) / Math.max(0.5, radius / 2)));
        for (let j = 1; j <= steps; j++) dab({ x: last.x + (p.x - last.x) * j / steps, y: last.y + (p.y - last.y) * j / steps });
        last = p;
        if (!frame) frame = requestAnimationFrame(() => { outCanvas.getContext('2d').putImageData(preview, 0, 0); frame = null; });
      },
      end: () => {
        if (frame) { cancelAnimationFrame(frame); frame = null; }
        if (touched.size) { strokes.push(Uint32Array.from(touched)); if (strokes.length > 25) strokes.shift(); }
        brush.hidden = true;
        run();
      }
    });
  });

  /* ---- saving ---- */
  async function save() {
    clearTimeout(timer);
    run();
    if (!result) return;
    const asset = {
      id: uid(), kind: inkKind, created: Date.now(),
      name: nameField.value.trim() || defaultName(),
      data: result.data, width: result.width, height: result.height
    };
    saveBtn.disabled = true;
    try { await inkStore('put', asset); }
    catch (e) {
      asset.sessionOnly = true;
      toast('Saved for this session only — this browser will not keep it.', true);
    }
    S.ink = (S.ink || []).concat([asset]);
    if (close) close();
    toast((inkKind === 'stamp' ? 'Stamp' : 'Signature') + ' saved. Tap it in the panel to place it.');
    if (onSaved) onSaved(asset);
  }
}

/* A way in for the test harness, and only when it is asked for. The probes
   drive the real interface, which is how a test should work, but a handful of
   these helpers — wrapping, range parsing, the rubber's geometry — are worth
   checking directly rather than through six layers of pointer events. Nothing
   is exposed unless the page is opened with ?selftest=1. */
try {
  if (/[?&]selftest=1(?:&|$)/.test(location.search)) {
    window.__paperless = Object.freeze({
      wrapText, parseRanges, splitInk, underRubber, rubberHitsBox, boxDist,
      shapeBox, textLines, textHeight, cssFilter, toBlobOrThrow, pageCrop,
      baselineEm, inkRuns, state: S,
      removePaper, adjustInk, inkStore, loadInkLibrary, inkBytes
    });
  }
} catch (e) {}

/* the saved ink library, read once at start-up */
loadInkLibrary().catch(() => {});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
