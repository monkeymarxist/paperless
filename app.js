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
  chev:   '<path d="M9 6l6 6-6 6"/>'
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

function modal(build) {
  const box = h('div', { class: 'sheetbox' });
  const back = $('#modal');
  clear(back).append(box);
  back.hidden = false;
  const close = () => { back.hidden = true; clear(back); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  back.onclick = e => { if (e.target === back) close(); };
  build(box, close);
  return close;
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
  mode: 'select', sizeMode: 'match', ratioGroups: new Map(), cropping: null, sideClosed: false, overflow: 'shrink',
  fmt: { weight: null, italic: null, color: null, scale: 1 }, lastRun: null,
  color: '#000000', fontSize: 16, fontName: 'Helvetica', strokeW: 2.5, rubberW: 14, penSeen: false, penOnly: true, cancelStroke: null, touches: 0,
  zoom: 1, sel: null,
  pageEls: []
};

const PALETTE = ['#000000', '#6b615d', '#8a0f14', '#0a74b8', '#1a7f4f', '#d08700', '#ffffff'];
const HL_PALETTE = ['#ffe44d', '#9cf27f', '#8fd4ff', '#ffb0d6', '#ffbb7a'];

/* A finger is not a mouse: coarse pointers get bigger targets and fewer steps. */
function coarsePointer() {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
}

function hex2rgb(x) {
  const m = x.replace('#', '');
  return rgb(parseInt(m.slice(0, 2), 16) / 255, parseInt(m.slice(2, 4), 16) / 255, parseInt(m.slice(4, 6), 16) / 255);
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

function pickFile(accept, multiple) {
  return new Promise(res => {
    const inp = $('#filein');
    inp.value = '';
    inp.accept = accept || '';
    inp.multiple = !!multiple;
    inp.onchange = () => res(multiple ? Array.from(inp.files) : inp.files[0] || null);
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
async function renderToCanvas(pageNo, scale, canvas) {
  const p = await S.doc.pdf.getPage(pageNo);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    { id: 'picture', label: 'Edit image', icon: 'image' },
    { id: 'img',    label: 'Add image', icon: 'plus' },
    { id: 'sign',   label: 'Sign',   icon: 'sign' }
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
    if (drawer) drawer.classList.toggle('open', drawOpen);
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

  const DRAW_MODES = ['ink', 'rect', 'ellipse', 'arrow', 'rub', 'hl', 'text'];
  function setMode(m) {
    S.mode = m;
    // while a drawing tool is up the page must not pan under the pointer
    $('#wb-stage').classList.toggle('drawing', DRAW_MODES.includes(m));
    if (typeof syncRail === 'function') syncRail();
    else rail.querySelectorAll('.trb').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === m));
    if (m !== 'select') select(null);
    renderSidePanel();
    for (const r of S.pageEls) {
      r.tlayer.hidden = m !== 'edittext';
      r.ilayer.hidden = m !== 'picture';
      if (m === 'edittext') buildTextLayer(r);
      if (m === 'picture') buildImageLayer(r);
    }
    if (m === 'img') insertImage();
    if (m === 'sign') signatureDialog();
  }

  /* ---- editing the document's own text ---- */
  async function buildTextLayer(rec) {
    if (rec.tbuilding || rec.runs) { paintTextLayer(rec); return; }
    rec.tbuilding = true;
    try {
      // colours and ink heights are read off the rendered page, so it has to
      // exist first — pages below the fold are still lazy at this point
      if (!rec.rendered || !rec.canvas.width) {
        rec.rendered = true;
        await renderToCanvas(rec.pg.n, Math.max(1.6, S.zoom), rec.canvas);
      }
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
      if (Math.abs(Math.atan2(m[1], m[0])) > 0.08) continue;   // skip rotated runs
      let real = '';
      try { if (page.commonObjs.has(it.fontName)) real = page.commonObjs.get(it.fontName).name || ''; } catch (e) {}
      raw.push({ x: m[4], baseline: m[5], w: it.width || size * it.str.length * 0.5, size, str: it.str, face: real || it.fontName || '' });
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
    const z = S.zoom;
    const font = r.font || guessStdFont(r.face);
    const size = r.fit != null ? r.fit : r.size;
    const fam = fontCss(font), wt = /Bold/.test(font) ? '700' : '400';
    const st = /Italic|Oblique/.test(font) ? 'italic' : 'normal';
    if (!r.probe) r.probe = sampleRun(rec.canvas, rec.pg.w, rec.pg.h, runBox(r));
    const keep = { top: node.style.top, h: node.style.height, w: node.style.width };
    const was = { w: r.w, dx: r.dx || 0, dy: r.dy || 0 };   // moving or re-wrapping counts as an edit too
    node.classList.add('editing');
    node.style.background = r.probe.bg;
    node.style.color = r.probe.fg;
    node.style.fontSize = (size * z) + 'px';
    node.style.lineHeight = (r.lineH * z) + 'px';     // the document's own leading
    node.style.fontFamily = fam;
    node.style.fontWeight = wt;
    node.style.fontStyle = st;
    node.style.textShadow = ((S.fmt.weight || r.weight) === 'semi')
      ? (size * z * 0.038).toFixed(2) + 'px 0 0 ' + r.probe.fg : '';
    node.style.whiteSpace = 'pre-wrap';               // wrap inside the block
    node.style.width = (r.w * z) + 'px';
    node.style.height = 'auto';
    node.style.minHeight = (r.h * z) + 'px';
    node.style.left = ((r.x + (r.dx || 0) - 1) * z) + 'px';
    node.style.top = ((r.baseline + (r.dy || 0) - size * baselineEm(fam, wt, st)) * z) + 'px';
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
    const mover = h('span', { class: 'movebar', title: 'Drag to move this text' });
    mover.addEventListener('pointerdown', e => {
      e.stopImmediatePropagation(); e.preventDefault();
      const ox = r.dx || 0, oy = r.dy || 0, sx = e.clientX, sy = e.clientY;
      const move = mv => {
        r.dx = ox + (mv.clientX - sx) / S.zoom;
        r.dy = oy + (mv.clientY - sy) / S.zoom;
        node.style.left = ((r.x + r.dx - 1) * S.zoom) + 'px';
        node.style.top = ((r.baseline + r.dy - size * baselineEm(fam, wt, st)) * S.zoom) + 'px';
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        node.focus();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    node.append(mover);

    // a handle on the right edge sets where the text wraps
    const grip = h('span', { class: 'wrapgrip', title: 'Drag to set the wrap width' });
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
        node.focus();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
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
      if (kept && (next !== r.str || moved || rewrapped))
        applyRunEdit(rec, r, next).catch(() => toast('That text could not be replaced.', true));
      else paintTextLayer(rec);
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
      if (!rec.rendered || !rec.canvas.width || rec.canvas.width < 60) {
        rec.rendered = true;
        await renderToCanvas(rec.pg.n, Math.max(1.6, S.zoom), rec.canvas);
      }
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

  const cssFilter = f => `brightness(${f.b}%) contrast(${f.c}%) saturate(${f.s}%) grayscale(${f.g}%)`;

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
      const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.92));
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
    const blob = await new Promise(r => cv.toBlob(r, a.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
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
      const blob = await new Promise(r => cv.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.92));
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
      const blob = await new Promise(r => cv.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.92));
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
    const rowsAt = sz => metrics ? wrapText(next, metrics, sz, r.w)
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
        w: r.w + size * 0.6, lh: size * lead,
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
        side.append(sizeRow('Size', a.size, 6, 72, v => { a.size = v; repaint(); }));
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
      if (['ink', 'rect', 'ellipse', 'arrow'].includes(a.type)) side.append(sizeRow('Stroke', a.strokeW, 1, 14, v => { a.strokeW = v; repaint(); }));
      if (a.type !== 'img') side.append(colorField(a.type === 'hl' ? HL_PALETTE : PALETTE, a.color, c => { pushUndo(); a.color = c; repaint(); renderSidePanel(); }));
      side.append(h('button', { class: 'btn danger sm', style: 'width:100%;justify-content:center', onclick: () => { pushUndo(); S.annots = S.annots.filter(x => x.id !== a.id); select(null); repaint(); } }, ico('trash'), 'Delete object'));
      side.append(h('p', { class: 'hint', style: 'font-size:11.5px;color:var(--ink-3);margin-top:12px' }, 'Drag to move. Use the corner handle to resize. Backspace deletes.'));
      return;
    }

    const names = { select: 'Select', edittext: 'Edit text', picture: 'Edit image', text: 'Add text', hl: 'Mark',
      ink: 'Pen', rect: 'Box', ellipse: 'Circle', arrow: 'Arrow', rub: 'Eraser', img: 'Image', sign: 'Sign' };
    side.append(h('div', { class: 'pane-h' }, names[S.mode] + ' tool'));
    const tips = {
      select: 'Click an object to move or resize it.',
      edittext: 'Click a paragraph and type. Bar above it moves the block, grip on the right re-wraps it. Ctrl/\u2318+Enter commits, Escape cancels.',
      text:   'Click where the text should start, then type.',
      hl:     'Drag across a line to mark it.',
      ink:    'Draw freehand.',
      rect:   'Drag to draw a box.',
      ellipse:'Drag to draw a circle or an oval.',
      arrow:  'Drag from the tail to the point.',
      rub:    'Drag over your own marks to rub them out.',
      picture:'Click a picture to lift it out, then move, crop or send it to another app.',
      img:    'Place a PNG, JPEG or WebP, then drag to size it.',
      sign:   'Draw your signature once, place it on any page.',
      erase:  'Click anything you added to remove it.'
    };
    side.append(h('p', { style: 'font-size:13px;color:var(--ink-2);margin-bottom:14px' }, tips[S.mode]));

    if (S.mode === 'edittext') {
      const edits = S.annots.filter(a => a.type === 'cover').length;
      side.append(h('p', { class: 'mono', style: 'font-size:12px;color:var(--ink-2);margin-bottom:14px' },
        `${edits} block${edits === 1 ? '' : 's'} replaced \u00b7 build 27`));
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
    if (S.mode === 'ink' || S.mode === 'rect' || S.mode === 'ellipse' || S.mode === 'arrow') {
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
      S.pageEls.push({ pg, box, canvas, layer, tlayer, ilayer, rendered: false, runs: null, imgs: null });
      bindLayer(layer, pg);
    }
    stage.append(sheet);
    applyZoom();
    observeRender();
    stage.addEventListener('pointerdown', e => {
      /* Only the Select tool cares about clearing the selection, and it is the
         one place where a repaint here is harmless. With a drawing tool up this
         fired on every stroke, repainting the layer out from under the live
         preview — which is why the rubber stopped showing where it was. */
      if (S.mode !== 'select') return;
      if (!e.target.closest('.an') && !e.target.closest('.handle')) select(null);
    });
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

    stage.addEventListener('pointerdown', e => {
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
    }, true);

    stage.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch') return;
      const p = live.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      if (gesture) { if (e.cancelable) e.preventDefault(); schedule(); }
    }, true);

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
    stage.addEventListener('pointerup', drop, true);
    stage.addEventListener('pointercancel', drop, true);
  }

  function observeRender() {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const rec = S.pageEls.find(r => r.box === en.target);
        if (rec && !rec.rendered) {
          rec.rendered = true;
          renderToCanvas(rec.pg.n, Math.max(1.2, S.zoom), rec.canvas).catch(() => {});
        }
      }
    }, { root: $('#wb-stage'), rootMargin: '400px' });
    S.pageEls.forEach(r => io.observe(r.box));
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
      n = h('div', Object.assign(base, { class: base.class + ' an-text' }));
      const fam = fontCss(a.font);
      const wt = /Bold/.test(a.font) ? 700 : 400;
      const st = /Italic|Oblique/.test(a.font) ? 'italic' : 'normal';
      // place the element so its FIRST BASELINE lands where the PDF will draw it
      const top = a.y + a.size * 0.82 - a.size * baselineEm(fam, wt, st);
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
    } else if (a.type === 'arrow' || a.type === 'erase') {
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
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          if (a.cropSel && (a.cropSel.w < 0.02 || a.cropSel.h < 0.02)) a.cropSel = null;
          renderSidePanel(); repaint();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
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
    if (a.type === 'text') {
      n.addEventListener('dblclick', () => editText(a, n));
    }
    if (S.sel === a.id && a.type !== 'ink') {
      const hd = h('span', { class: 'handle' });
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
        pushUndo();
        const a = { id: uid(), type: 'text', page: pg.n, x: p.x, y: p.y, w: Math.min(260, pg.w - p.x - 10), text: '', size: S.fontSize, color: S.color, font: S.fontName };
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
        dragLoop(e, (dx, dy) => {
          a.w = Math.max(2, dx / S.zoom);
          if (S.mode === 'hl') a.h = Math.max(S.fontSize * 0.9, dy / S.zoom || S.fontSize * 1.1);
          else a.h = Math.max(2, dy / S.zoom);
          node = swapNode(layer, a, node);
        }, () => { select(a.id); renderSidePanel(); });
      } else if (S.mode === 'arrow') {
        pushUndo();
        // w/h are the vector from tail to tip, so either may be negative
        const a = { id: uid(), type: 'arrow', page: pg.n, x: p.x, y: p.y, w: 1, h: 0, color: S.color, strokeW: S.strokeW };
        S.annots.push(a);
        let node = null;
        dragLoop(e, (dx, dy) => {
          a.w = dx / S.zoom; a.h = dy / S.zoom;
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
          }
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
          }
        });
      } else if (S.mode === 'img' && S.pendingImage) {
        placePending(pg, p);
      } else if (S.mode === 'sign' && S.pendingSig) {
        placePending(pg, p);
      }
    });
  }

  function placePending(pg, p) {
    const src = S.pendingImage || S.pendingSig;
    if (!src) return;
    pushUndo();
    const maxW = Math.min(src.w, pg.w * 0.5);
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
        move: ev => { const last = allSamples(ev).pop(); onMove(last.clientX - sx, last.clientY - sy); },
        end: () => { if (onEnd) onEnd(); }
      });
      return;
    }
    const move = ev => onMove(ev.clientX - sx, ev.clientY - sy);
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

  function onAnnotDown(e, a, node) {
    e.stopPropagation();
    if (node.getAttribute('contenteditable') === 'true') return;
    select(a.id);
    renderSidePanel();
    const ox = a.x, oy = a.y, opts = a.pts ? a.pts.map(p => p.slice()) : null;
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
        a.pts = opts.map(q => [q[0] + mx, q[1] + my]);
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
      if (a.type === 'arrow') {            // the handle is the tip: any direction
        a.w = ow + dx / S.zoom; a.h = oh + dy / S.zoom;
        repaint(); return;
      }
      a.w = Math.max(8, ow + dx / S.zoom);
      if (a.type === 'text') a.size = Math.max(6, Math.round(os * (a.w / Math.max(1, ow))));
      else a.h = Math.max(4, oh + dy / S.zoom);
      repaint();
    });
  }

  function editText(a, node, selectAll) {
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
      const v = node.textContent.replace(/\u00a0/g, ' ');
      if (v !== a.text) a.text = v;
      if (!a.text.trim()) S.annots = S.annots.filter(x => x.id !== a.id);
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

  function pushUndo() {
    S.undoStack.push(JSON.stringify(S.annots));
    if (S.undoStack.length > 40) S.undoStack.shift();
    S.redoStack.length = 0;
  }
  function undo() {
    if (!S.undoStack.length) return;
    S.redoStack.push(JSON.stringify(S.annots));
    S.annots = JSON.parse(S.undoStack.pop());
    S.sel = null; repaint(); renderSidePanel();
  }
  function redo() {
    if (!S.redoStack.length) return;
    S.undoStack.push(JSON.stringify(S.annots));
    S.annots = JSON.parse(S.redoStack.pop());
    S.sel = null; repaint(); renderSidePanel();
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
              const blob = await new Promise(r => trimmed.toBlob(r, 'image/png'));
              const bytes = new Uint8Array(await blob.arrayBuffer());
              S.pendingSig = { url: URL.createObjectURL(blob), bytes, fmt: 'png', w: trimmed.width / 2, h: trimmed.height / 2 };
              close();
              toast('Click on a page to place your signature');
            }
          }, 'Use signature')
        )
      );
      requestAnimationFrame(resize);
    });
  }

  /* ---- write the edited document ---- */
  async function exportEdited() {
    if (!S.annots.length) { toast('Nothing has been added yet.', true); return; }
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
        const { width: W, height: H } = page.getSize();
        const R = ((page.getRotation().angle % 360) + 360) % 360;
        const map = (dx, dy, dw = 0, dh = 0) => {
          if (R === 90) return { x: dy + dh, y: dx };
          if (R === 180) return { x: W - dx, y: dy + dh };
          if (R === 270) return { x: W - dy - dh, y: H - dx };
          return { x: dx, y: H - dy - dh };
        };

        if (a.type === 'text') {
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
    } finally { setTimeout(() => progress(null), 400); }
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
function baselineEm(family, weight, style) {
  const key = family + '|' + weight + '|' + style;
  if (BASELINE.has(key)) return BASELINE.get(key);
  let v = 1.015;
  try {
    const probe = h('span', { style: `position:absolute;left:-9999px;top:0;visibility:hidden;font-family:${family};font-weight:${weight};font-style:${style};font-size:100px;line-height:1.22` }, 'Hxy');
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
    const blob = await new Promise(r => cv.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.92));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), fmt: png ? 'png' : 'jpg' };
  } catch (e) { return { bytes, fmt: a.fmt }; }
}

function wrapText(text, font, size, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const probe = line ? line + ' ' + word : word;
      let w = 0;
      try { w = font.widthOfTextAtSize(probe, size); } catch (e) { w = probe.length * size * 0.5; }
      if (w > maxW && line) { out.push(line); line = word; } else line = probe;
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
  // WebP (and anything not PNG/JPEG) is re-encoded so pdf-lib can embed it.
  if (!isPng && !/jpe?g$/i.test(file.name) && file.type !== 'image/jpeg') {
    const cv = h('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    cv.getContext('2d').drawImage(im, 0, 0);
    const jb = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.92));
    return { url: URL.createObjectURL(jb), bytes: new Uint8Array(await jb.arrayBuffer()), fmt: 'jpg', w: im.naturalWidth, h: im.naturalHeight };
  }
  return { url, bytes, fmt: isPng ? 'png' : 'jpg', w: im.naturalWidth, h: im.naturalHeight };
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
    progress(0.1);
    try {
      const src = await PDFDocument.load(S.doc.bytes.slice(0), { ignoreEncryption: true });
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, list.map(i => i.src));
      copied.forEach((pg, i) => {
        const base = ((pg.getRotation().angle % 360) + 360) % 360;
        pg.setRotation(degrees((base + list[i].rot + 360) % 360));
        out.addPage(pg);
      });
      const bytes = await out.save();
      progress(1);
      await offerFile(outName(S.doc.name, isExtract ? '-extract' : '-organized'), bytes);
      offerContinue(bytes, outName(S.doc.name, isExtract ? '-extract' : '-organized'));
    } catch (e) {
      toast('Could not write the PDF: ' + (e.message || 'unknown error'), true);
    } finally { setTimeout(() => progress(null), 400); }
  }

  draw();
}

/* Offer to keep working on a produced file inside the app. */
function offerContinue(bytes, name) {
  toast('Tip: use “Keep working on it” to chain another tool');
  const acts = $('#wb-actions');
  if (acts.querySelector('[data-cont]')) return;
  acts.prepend(h('button', {
    class: 'btn sm', 'data-cont': '1', onclick: async () => {
      await setDoc(new Uint8Array(bytes), name);
      updateMeta();
      mount(S.tool);
      toast('Now working on ' + name);
    }
  }, 'Keep working on it'));
}

/* ================================================================== MERGE */
function mountMerge() {
  const stage = $('#wb-stage');
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const acts = $('#wb-actions');
  let files = [];

  if (S.doc) files.push({ key: uid(), name: S.doc.name, bytes: S.doc.bytes, kind: 'pdf', size: S.doc.bytes.length });

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
    if (files.length < 2) { toast('Add at least two files to merge.', true); return; }
    progress(0.05);
    try {
      const out = await PDFDocument.create();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.kind === 'pdf') {
          const src = await PDFDocument.load(f.bytes.slice(0), { ignoreEncryption: true });
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(p => out.addPage(p));
        } else {
          const emb = f.img.fmt === 'png' ? await out.embedPng(f.img.bytes) : await out.embedJpg(f.img.bytes);
          const pg = out.addPage([emb.width, emb.height]);
          pg.drawImage(emb, { x: 0, y: 0, width: emb.width, height: emb.height });
        }
        progress(0.05 + 0.9 * ((i + 1) / files.length));
      }
      const bytes = await out.save();
      progress(1);
      await offerFile('merged.pdf', bytes);
      offerContinue(bytes, 'merged.pdf');
    } catch (e) {
      toast('Merge failed: ' + (e.message || 'unknown error'), true);
    } finally { setTimeout(() => progress(null), 400); }
  }

  draw();
}

/* ================================================================== SPLIT */
function parseRanges(spec, total) {
  const out = [];
  for (const chunk of String(spec).split(',')) {
    const t = chunk.trim();
    if (!t) continue;
    let m;
    if ((m = t.match(/^(\d+)\s*-\s*(\d+)$/))) {
      const a = clamp(+m[1], 1, total), b = clamp(+m[2], 1, total);
      out.push({ from: Math.min(a, b), to: Math.max(a, b) });
    } else if ((m = t.match(/^(\d+)\s*-$/))) {
      out.push({ from: clamp(+m[1], 1, total), to: total });
    } else if ((m = t.match(/^-\s*(\d+)$/))) {
      out.push({ from: 1, to: clamp(+m[1], 1, total) });
    } else if ((m = t.match(/^\d+$/))) {
      const a = clamp(+t, 1, total); out.push({ from: a, to: a });
    }
  }
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

  function preview() {
    const rs = ranges();
    clear(stage);
    const wrap = h('div', { class: 'flist' });
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
    panel();
  }

  async function run() {
    const rs = ranges();
    if (!rs.length) { toast('Enter at least one valid range.', true); return; }
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
    } finally { setTimeout(() => progress(null), 400); }
  }

  preview();
}

/* ========================================================== PDF → IMAGES */
function mountToImages() {
  if (!S.doc) return needDoc('Open a PDF to convert', null, async files => {
    if (await openPdfFile(files[0])) mountToImages();
  });
  const side = $('#wb-side'); side.dataset.wanted = '1'; applySidePanel();
  const stage = $('#wb-stage');
  let dpi = 150, fmt = 'png', quality = 0.9;

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
    progress(0.02);
    try {
      const scale = dpi / 72;
      const made = [];
      for (let i = 1; i <= S.doc.pages.length; i++) {
        const cv = document.createElement('canvas');
        const p = await S.doc.pdf.getPage(i);
        const vp = p.getViewport({ scale });
        cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
        const ctx = cv.getContext('2d');
        if (fmt === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(r => cv.toBlob(r, 'image/' + fmt, fmt === 'jpeg' ? quality : undefined));
        made.push({ name: outName(S.doc.name, '-p' + String(i).padStart(2, '0'), fmt === 'png' ? '.png' : '.jpg'), blob });
        progress(0.02 + 0.9 * (i / S.doc.pages.length));
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
    } finally { setTimeout(() => progress(null), 400); }
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
  let size = 'fit', margin = 0;

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
            h('button', { title: 'Remove', onclick: () => { imgs.splice(i, 1); draw(); } }, ico('trash')),
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
    if (!imgs.length) { toast('Add at least one image.', true); return; }
    progress(0.05);
    try {
      const out = await PDFDocument.create();
      for (let i = 0; i < imgs.length; i++) {
        const im = imgs[i].img;
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
        progress(0.05 + 0.9 * ((i + 1) / imgs.length));
      }
      const bytes = await out.save();
      progress(1);
      await offerFile('images.pdf', bytes);
      offerContinue(bytes, 'images.pdf');
    } catch (e) {
      toast('Could not build the PDF: ' + (e.message || 'unknown error'), true);
    } finally { setTimeout(() => progress(null), 400); }
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
  let dpi = 110, quality = 0.62;

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
    progress(0.02);
    try {
      const out = await PDFDocument.create();
      const scale = dpi / 72;
      for (let i = 1; i <= S.doc.pages.length; i++) {
        const p = await S.doc.pdf.getPage(i);
        const vp = p.getViewport({ scale });
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.floor(vp.width)); cv.height = Math.max(1, Math.floor(vp.height));
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        await p.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', quality));
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
    } finally { setTimeout(() => progress(null), 400); }
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
    if (Math.abs(Math.atan2(m[1], m[0])) > 0.08) continue;      // rotated text
    let real = '';
    try { if (page.commonObjs.has(it.fontName)) real = page.commonObjs.get(it.fontName).name || ''; } catch (e) {}
    raw.push({ x: m[4], baseline: m[5], w: it.width || size * it.str.length * 0.5, size, str: it.str, face: real || it.fontName || '' });
  }
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
function cropToImage(canvas, pgW, pgH, r) {
  const sx = canvas.width / pgW, sy = canvas.height / pgH;
  const w = Math.max(1, Math.round(r.w * sx)), h = Math.max(1, Math.round(r.h * sy));
  const cut = document.createElement('canvas');
  cut.width = w; cut.height = h;
  const cx = cut.getContext('2d');
  cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
  cx.drawImage(canvas, Math.round(r.x * sx), Math.round(r.y * sy),
    Math.round(r.w * sx), Math.round(r.h * sy), 0, 0, w, h);
  const big = w * h > 90000;
  return new Promise(res => cut.toBlob(
    b => res({ blob: b, ext: big ? 'jpeg' : 'png' }),
    big ? 'image/jpeg' : 'image/png', 0.86));
}

/* ---- WordprocessingML fragments ---- */
function wRun(text, fmt) {
  const f = fmt.font;
  const rPr = '<w:rPr>' +
    `<w:rFonts w:ascii="${xmlEsc(f)}" w:hAnsi="${xmlEsc(f)}" w:cs="${xmlEsc(f)}"/>` +
    (fmt.bold ? '<w:b/>' : '') + (fmt.italic ? '<w:i/>' : '') +
    `<w:sz w:val="${fmt.half}"/><w:szCs w:val="${fmt.half}"/>` +
    (fmt.color ? `<w:color w:val="${fmt.color}"/>` : '') +
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
    if (n === 1) { pageW = vp.width; pageH = vp.height; }

    const lines = wordLines((await page.getTextContent()).items, vp, page);
    const blocks = wordBlocks(lines);
    const rects = opts.images ? await wordImageRects(page, vp) : [];

    if (needsPixels && (blocks.length || rects.length)) {
      await renderToCanvas(n, opts.images ? 2 : 1, canvas);
    }

    if (n === 1 && blocks.length) {
      marginL = Math.max(18, Math.min(...blocks.map(b => b.x)));
      marginT = Math.max(18, Math.min(...blocks.map(b => b.y)));
      marginR = Math.max(18, pageW - Math.max(...blocks.map(b => b.x + b.w)));
      marginB = Math.max(18, pageH - Math.max(...blocks.map(b => b.y + b.h)));
    }

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

    const colW = pageW - marginL - marginR;
    const items = rows.map(r => ({ y: r.top, row: r })).concat(rects.map(r => ({ y: r.y, rect: r })));
    items.sort((a, b) => a.y - b.y);

    for (const item of items) {
      if (item.rect) {
        const cut = await cropToImage(canvas, pageW, pageH, item.rect);
        if (!cut || !cut.blob) continue;
        const name = `image${media.length + 1}.${cut.ext}`;
        media.push({ name, blob: cut.blob });
        const rid = `rId${100 + media.length}`;
        stats.images++;
        // a picture wider than the column is scaled down rather than pushed off it
        let iw = item.rect.w, ih = item.rect.h;
        if (!opts.layout && iw > colW) { ih = ih * (colW / iw); iw = colW; }
        const pPr = opts.layout
          ? `<w:framePr w:w="${Math.round(item.rect.w * TW_PT)}" w:h="${Math.round(item.rect.h * TW_PT)}" w:hRule="exact" w:wrap="none" w:vAnchor="page" w:hAnchor="page" w:x="${Math.round(item.rect.x * TW_PT)}" w:y="${Math.round(item.rect.y * TW_PT)}"/>`
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
        if (opts.colour && canvas.width) {
          const sm = sampleRun(canvas, pageW, pageH, { x: cell.x, y: cell.y, w: Math.max(6, cell.w), h: Math.max(6, cell.h) });
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

      const pPrBits = [];
      if (style) pPrBits.push(`<w:pStyle w:val="${style}"/>`);
      if (opts.layout) {
        pPrBits.push(`<w:framePr w:w="${Math.round((b.w + b.size) * TW_PT)}" w:h="${Math.round((b.h + 2) * TW_PT)}" w:hRule="auto" w:wrap="none" w:vAnchor="page" w:hAnchor="page" w:x="${Math.round(b.x * TW_PT)}" w:y="${Math.round(b.y * TW_PT)}"/>`);
        pPrBits.push(`<w:spacing w:after="0" w:line="${Math.round(b.lineH * TW_PT)}" w:lineRule="exact"/>`);
      } else {
        if (multi) {
          const stops = cells.slice(1).map(c => `<w:tab w:val="left" w:pos="${Math.round(clamp(c.x - marginL, 0, colW - 20) * TW_PT)}"/>`).join('');
          pPrBits.push('<w:tabs>' + stops + '</w:tabs>');
        }
        if (numId) pPrBits.push(`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`, '<w:pStyle w:val="ListParagraph"/>');
        const indent = Math.round((b.x - marginL) * TW_PT);
        if (!numId && !multi && indent > 140) pPrBits.push(`<w:ind w:left="${indent}"/>`);
        if (!multi) {
          const slackL = b.x - marginL, slackR = (marginL + colW) - (b.x + b.w);
          if (slackL > 28 && Math.abs(slackL - slackR) < Math.max(10, b.size)) pPrBits.push('<w:jc w:val="center"/>');
        }
        const after = Math.round(Math.min(360, Math.max(60, (b.size * 0.42) * TW_PT)));
        const line = Math.round(240 * (b.lineH / (b.size * 1.2)));
        pPrBits.push(`<w:spacing w:after="${after}" w:line="${clamp(line, 180, 480)}" w:lineRule="auto"/>`);
      }
      out.push('<w:p><w:pPr>' + pPrBits.join('') + '</w:pPr>' + runs.filter(Boolean).join('') + '</w:p>');
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

  async function run() {
    if (busy) return;
    busy = true; saveBtn.disabled = true;
    clear(stage).append(h('div', { class: 'empty' }, h('div', { class: 'inner' },
      ico('word'), h('h3', null, 'Rebuilding the document…'),
      h('p', null, 'Reading every page, grouping the glyphs into paragraphs.'))));
    progress(0.04);
    try {
      built = await convertToWord(opts, f => progress(0.04 + 0.92 * f));
      progress(null);
      show();
    } catch (e) {
      progress(null);
      console.error(e);
      clear(stage).append(h('div', { class: 'empty' }, h('div', { class: 'inner' },
        ico('file'), h('h3', null, 'Could not convert this document'),
        h('p', null, String(e && e.message || e)))));
      toast('Conversion failed.', true);
    }
    busy = false; saveBtn.disabled = !built;
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
  const finish = kind => e => {
    if (e && e.pointerId !== id) return;
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancelled);
    el.removeEventListener('lostpointercapture', cancelled);
    if (captured) { try { el.releasePointerCapture(id); } catch (e2) {} }
    if (kind === 'up') end && end(e);
    else (cancel || end) && (cancel || end)(e);
  };
  const up = finish('up');
  const cancelled = finish('cancel');
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancelled);
  el.addEventListener('lostpointercapture', cancelled);
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

function shapeBox(a) {
  if (a.type === 'arrow') {
    return { x: Math.min(a.x, a.x + a.w), y: Math.min(a.y, a.y + a.h), w: Math.abs(a.w), h: Math.abs(a.h) };
  }
  if (a.pts && a.pts.length) {
    const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
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

function rubberHitsBox(box, stroke, r) {
  for (const [x, y] of stroke.pts) {
    if (x >= box.x - r && x <= box.x + box.w + r && y >= box.y - r && y <= box.y + box.h + r) return true;
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
  return runs.filter(run => run.length > 1);
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
    String(a.text || '').split('\n').forEach((line, i) => {
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
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    id: uid(), type: 'img', page: a.page, x, y, w, h,
    url: cv.toDataURL('image/png'), bytes, fmt: 'png',
    rubbed: true, nat: { w: cv.width, h: cv.height }
  };
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
    const spawn = blobURL => Promise.race([
      Tesseract.createWorker([{ code: 'eng', data }], 1, {
        workerPath: ocrUrl('lib/tess/worker.min.js'),
        corePath: ocrUrl('lib/tess/core'),
        workerBlobURL: blobURL,
        logger: m => { if (onLog) onLog(m); }
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('the engine did not finish starting within 45 seconds')), 45000))
    ]);
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
  return TESS_BUSY;
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

  const opts = { dpi: 200, skipText: true };
  const pages = [];            // {n, w, h, canvas, layer, words, text, state}
  let running = false, done = 0, note = null;

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
        h('span', { class: 'hint' }, opts.dpi === 150 ? 'Quick, and enough for clean print.'
          : opts.dpi === 300 ? 'Slowest. Worth it for small type or a poor scan.'
          : 'A good balance for most scans.')),
      h('div', { class: 'field' },
        h('label', { for: 'ocr-skip', style: 'display:flex;align-items:center;gap:8px;cursor:pointer' },
          h('input', { type: 'checkbox', id: 'ocr-skip', checked: opts.skipText, onchange: e => { opts.skipText = e.target.checked; panel(); } }),
          'Skip pages that already have text'),
        h('span', { class: 'hint' }, 'A page with a text layer is already selectable — nothing to gain by reading it again.')),
      h('button', {
        class: 'btn primary', style: 'width:100%;justify-content:center',
        disabled: running, onclick: () => start()
      }, ico(running ? 'undo' : 'check'), running ? 'Reading…' : (done ? 'Read again' : 'Read the document')),
      note,
      h('details', { style: 'margin-top:16px;font-size:12px;color:var(--ink-2)' },
        h('summary', { style: 'cursor:pointer;color:var(--ink-3)' }, 'How this works'),
        h('p', { style: 'margin-top:8px' },
          'Tesseract runs as WebAssembly in this tab, with the English model served from the page itself — about 11 MB, fetched once when you open this tool. Saving writes the words back into the PDF as an invisible text layer over the picture, which is what makes a scan searchable in any reader.'),
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
    running = true; done = 0; note = null; panel();
    saveBtn.disabled = txtBtn.disabled = copyBtn.disabled = true;
    pages.length = 0;
    const total = S.doc.pages.length;
    const scale = opts.dpi / 72;
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
        const p = pages[i];
        p.state = 'reading'; sheet(); paintAll();
        const shot = document.createElement('canvas');
        await renderToCanvas(p.n, scale, shot);
        p.px = shot.width;
        // the page the viewer sees, at screen resolution
        await renderToCanvas(p.n, Math.max(1, p.w / p.ptW) * 1.5, p.canvas);

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
          const { data } = await worker.recognize(shot, {}, { text: true, blocks: true });
          const keep = w => { const t = (w.text || '').trim();
            return t && (/[A-Za-z0-9]/.test(t) || (w.confidence != null && w.confidence >= 70)); };
          p.words = ocrWords(data).filter(keep);
          p.lines = ocrLines(data).filter(l => (l.text || '').trim());
          p.text = (data.text || '').trim();
          p.state = p.words.length + ' words';
        }
        done++;
        progress(done / total);
        sheet(); paintAll();
      }
      progress(null);
      const read = pages.reduce((a, p) => a + (p.words ? p.words.length : 0), 0);
      const skipped = pages.filter(p => p.state === 'already searchable').length;
      note = h('p', { class: 'hint', style: 'margin-top:10px' }, read
        ? `${read.toLocaleString()} words recognised` + (skipped ? `, ${skipped} page${skipped === 1 ? '' : 's'} already had text` : '') + '. Drag across the page to select.'
        : `Every page already carries its own text, so there was nothing to recognise. Select and copy from the page, or take the text out with Save .txt.`);
      saveBtn.disabled = !read;
      txtBtn.disabled = copyBtn.disabled = !pages.some(p => p.text);
    } catch (e) {
      progress(null);
      console.error(e);
      TESS = TESS_BUSY = null;
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
    }
    running = false;
    panel();
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
        const { height: H } = page.getSize();
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
          page.drawText(t, { x: b.x0 * k, y: H - (b.y1 * k) + bh * 0.18, size, font });
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
    try { await loadSample(); openTool('edit'); toast('Sample document opened — try the Sign tool on page 3'); }
    catch (e) { console.error('sample build failed', e); toast('Could not build the sample.', true); }
  });

  document.addEventListener('keydown', e => {
    if ($('#view-tool').hidden) return;
    const typing = /input|textarea/i.test(e.target.tagName) || e.target.isContentEditable;
    if (typing) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      const b = $('#wb-actions').querySelectorAll('button');
      if (b.length) (e.shiftKey ? b[1] : b[0]).click();
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && S.sel) {
      e.preventDefault();
      S.undoStack.push(JSON.stringify(S.annots));
      S.annots = S.annots.filter(x => x.id !== S.sel);
      S.sel = null;
      if (S.tool === 'edit') mount('edit');
    }
    if (e.key === 'Escape') showHome();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
