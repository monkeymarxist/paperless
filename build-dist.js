#!/usr/bin/env node
/* Builds the standalone copy in /home/claude/dist/Paperless from this folder.

   This used to be done by hand with a couple of sed and cat commands, and one
   of them appended the four library <script> tags to a file that already had
   them — so every rebuild added another set. Build 36 shipped loading pdf.js,
   pdf-lib, JSZip and tesseract.js SEVEN times each, several megabytes parsed
   for nothing. A script that writes the file from scratch cannot drift that
   way: run it as often as you like and the output is the same.

   Usage: node build-dist.js            (uses the app.vNN.js index.html names)   */

const fs = require('fs');
const path = require('path');

const SRC = __dirname;
const OUT = '/home/claude/dist/Paperless';

/* ---- which build are we shipping? whatever index.html loads ---- */
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const m = html.match(/<script src="(app\.v\d+\.js)"><\/script>\s*$/);
if (!m) { console.error('index.html does not end with a <script src="app.vNN.js"> tag'); process.exit(1); }
const appFile = m[1];
const build = (html.match(/Build (\d+)/) || [])[1] || '?';

/* ---- the page: a real document head, then the project's own markup ---- */
const PREAMBLE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  img{max-width:100%}
  [hidden]{display:none!important}
</style>
`;
const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%238a0f14'/%3E%3Crect x='9' y='7' width='14' height='18' rx='2' fill='%23fff'/%3E%3Crect x='12' y='11' width='8' height='1.6' fill='%238a0f14'/%3E%3Crect x='12' y='15' width='8' height='1.6' fill='%238a0f14'/%3E%3Crect x='12' y='19' width='5' height='1.6' fill='%23b4131c'/%3E%3C/svg%3E">
`;

const lines = html.replace(/\s+$/, '').split('\n');
if (!/^<title>/.test(lines[0])) { console.error('expected index.html to open with <title>'); process.exit(1); }
const title = lines[0];
/* Everything after the title, with the versioned script renamed. The library
   tags are already in there exactly once; nothing is added. */
const body = lines.slice(1).join('\n').replace(`src="${appFile}"`, 'src="app.js"');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), PREAMBLE + title + '\n' + ICON + body + '\n</body>\n</html>\n');

/* ---- the script, with a download that works outside the Claude frame ---- */
const NO_HOST = `  if (!dl) { toast('Saving files is not available in this view.', true); return false; }`;
const FALLBACK = `  if (!dl) {
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
  }`;
let app = fs.readFileSync(path.join(SRC, appFile), 'utf8');
if (app.indexOf(NO_HOST) < 0) { console.error('could not find the offerFile guard to patch'); process.exit(1); }
app = app.replace(NO_HOST, FALLBACK);
fs.writeFileSync(path.join(OUT, 'app.js'), app);

/* ---- the harnesses, so the folder can be checked on its own ---- */
fs.mkdirSync(path.join(OUT, 'tests'), { recursive: true });
let probes = 0;
for (const f of fs.readdirSync(SRC)) {
  if (/^(probe\d*|smoke)\.js$/.test(f)) { fs.copyFileSync(path.join(SRC, f), path.join(OUT, 'tests', f)); probes++; }
}

/* ---- check what we wrote ---- */
const out = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const once = n => (out.match(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
const libs = ['lib/pdf.min.js', 'lib/pdf-lib.min.js', 'lib/jszip.min.js', 'lib/tess/tesseract.min.js'];
let bad = libs.filter(l => once(l) !== 1);
if (once('app.js') !== 1) bad.push('app.js');
if (/app\.v\d+\.js/.test(out)) bad.push('a versioned script name is still in the page');
if (bad.length) { console.error('BAD BUILD — each should appear once: ' + bad.join(', ')); process.exit(1); }

console.log(`dist/Paperless written from ${appFile} (build ${build})`);
console.log(`  index.html  ${out.length} bytes, each library loaded exactly once`);
console.log(`  app.js      ${app.length} bytes, with the standalone download fallback`);
console.log(`  tests/      ${probes} harnesses`);
