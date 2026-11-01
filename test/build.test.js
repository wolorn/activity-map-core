// node test/build.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const build = path.join(__dirname, '..', 'tools', 'build.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
const run = (src, out) => spawnSync('node', [build, '--source', src, '--out', out], { encoding: 'utf8' });

// 1. Cas nominal
const out = path.join(tmp, 'dist');
let r = run(path.join(__dirname, 'fixture-source'), out);
assert.strictEqual(r.status, 0, r.stderr);
for (const f of ['index.html', 'app.js', 'zip.js', 'aggregate.js', 'style.css', 'source.js', 'extra/demo.js', 'vendor/leaflet.js', '.nojekyll']) {
  assert.ok(fs.existsSync(path.join(out, f)), 'manquant : ' + f);
}
assert.ok(!fs.existsSync(path.join(out, 'index.template.html')), 'le modèle ne doit pas être publié');
assert.ok(!fs.existsSync(path.join(out, 'activity-source.json')), 'la config ne doit pas être publiée');
const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
assert.ok(html.includes('<title>Source de test &lt;&amp;&gt;</title>'), 'titre échappé');
assert.ok(html.includes('<script src="source.js"></script>'));
assert.ok(html.indexOf('source.js') < html.indexOf('app.js'), 'la source est chargée avant app.js');
assert.ok(!/\{\{/.test(html));
assert.ok(/script-src 'self'/.test(html), 'CSP conservée');

// 2. Entrées refusées
function bad(conf, msg) {
  const d = fs.mkdtempSync(path.join(tmp, 'src-'));
  fs.writeFileSync(path.join(d, 'source.js'), '');
  fs.writeFileSync(path.join(d, 'activity-source.json'), JSON.stringify(conf));
  const x = run(d, path.join(tmp, 'o'));
  assert.notStrictEqual(x.status, 0, msg);
  return x.stderr;
}
bad({ title: 'x', scripts: ['../evil.js'] }, 'chemin parent');
bad({ title: 'x', scripts: ['/etc/passwd'] }, 'chemin absolu');
bad({ title: 'x', scripts: ['"><script>.js'] }, 'caractères dangereux');
bad({ title: 'x', scripts: ['app.js'] }, 'nom réservé');
bad({ title: 'x', scripts: ['absent.js'] }, 'fichier absent');
bad({ title: '', scripts: ['source.js'] }, 'titre vide');
bad({ title: 'x', scripts: [] }, 'aucun script');
bad({ title: 'x', scripts: ['source.js'], files: ['vendor/x.js'] }, 'écrase vendor/');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('OK : assemblage du site (nominal + entrées refusées).');
