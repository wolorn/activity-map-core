#!/usr/bin/env node
/*
 * Assemble un site complet : interface commune (web/) + fichiers de la source.
 *
 *   node tools/build.js --source <dossier-source> --out <dossier-sortie>
 *
 * Le dossier source contient activity-source.json :
 *   {
 *     "title":   "Titre de la page",
 *     "scripts": ["lecteur.js", "source.js"],   // chargés avant app.js, dans cet ordre
 *     "files":   ["demo-data.js"]               // autres fichiers à publier tels quels
 *   }
 * Le dossier source n'est jamais publié en entier : seuls les fichiers listés le sont.
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : null;
}
function fail(msg) { console.error('Erreur : ' + msg); process.exit(1); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*(\/[A-Za-z0-9_][A-Za-z0-9_.\-]*)*$/;
const RESERVED = new Set(['index.html', 'app.js', 'zip.js', 'aggregate.js', 'style.css']);

const coreRoot = path.resolve(__dirname, '..');
const webDir = path.join(coreRoot, 'web');
const srcDir = arg('source') && path.resolve(arg('source'));
const outDir = arg('out') && path.resolve(arg('out'));
if (!srcDir || !outDir) fail('usage : node tools/build.js --source <dossier> --out <dossier>');

let conf;
try { conf = JSON.parse(fs.readFileSync(path.join(srcDir, 'activity-source.json'), 'utf8')); }
catch (e) { fail('activity-source.json illisible dans ' + srcDir + ' (' + e.message + ')'); }

if (typeof conf.title !== 'string' || !conf.title.trim()) fail('"title" manquant dans activity-source.json');
const scripts = Array.isArray(conf.scripts) ? conf.scripts : [];
const files = Array.isArray(conf.files) ? conf.files : [];
if (!scripts.length) fail('"scripts" doit lister au moins un fichier .js');

function checkRel(p, what) {
  if (typeof p !== 'string' || !SAFE_PATH.test(p) || p.includes('..')) fail(what + ' invalide : ' + JSON.stringify(p));
  if (RESERVED.has(p) || p.startsWith('vendor/')) fail(what + ' réservé par l\'interface commune : ' + p);
  const abs = path.join(srcDir, p);
  if (!abs.startsWith(srcDir + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) fail(what + ' introuvable : ' + p);
}
scripts.forEach((p) => { checkRel(p, 'script'); if (!p.endsWith('.js')) fail('script non .js : ' + p); });
files.forEach((p) => checkRel(p, 'fichier'));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile() && e.name !== 'index.template.html') fs.copyFileSync(a, b);
  }
}
copyDir(webDir, outDir);

[...scripts, ...files].forEach((p) => {
  const dest = path.join(outDir, p);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(srcDir, p), dest);
});

const tpl = fs.readFileSync(path.join(webDir, 'index.template.html'), 'utf8');
const tags = scripts.map((p) => '  <script src="' + esc(p) + '"></script>').join('\n');
const html = tpl.replace('{{TITLE}}', () => esc(conf.title)).replace('{{SOURCE_SCRIPTS}}', () => tags);
if (/\{\{[A-Z_]+\}\}/.test(html)) fail('marqueur non remplacé dans le modèle');
fs.writeFileSync(path.join(outDir, 'index.html'), html);
fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

console.log('Site assemblé dans ' + outDir + ' (' + scripts.length + ' script(s) de source, ' + files.length + ' fichier(s)).');
