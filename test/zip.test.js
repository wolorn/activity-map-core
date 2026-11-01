// node test/zip.test.js  (Node 18+, Python 3 pour fabriquer les archives de test)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const Z = require('../web/zip.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
const big = Buffer.from('0123456789'.repeat(100000)); // 1 Mo, compressible
const gz = zlib.gzipSync(Buffer.from('contenu gzip : ' + 'x'.repeat(5000)));
fs.writeFileSync(path.join(tmp, 'big.txt'), big);
fs.writeFileSync(path.join(tmp, 'a.txt.gz'), gz);

function mkZip(name, zip64) {
  const py = `
import sys, zipfile
out, d, z64 = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('dossier/hello.json', '{"ok": "é"}')
    with z.open('dossier/big.txt', 'w', force_zip64=z64) as f:
        f.write(open(d + '/big.txt', 'rb').read())
    z.write(d + '/a.txt.gz', 'dossier/a.txt.gz')
    z.writestr('stocke.txt', 'tel quel', compress_type=zipfile.ZIP_STORED)
`;
  const p = path.join(tmp, name);
  execFileSync('python3', ['-I', '-c', py, p, tmp, zip64 ? '1' : '0']);
  return p;
}
const blobOf = (p) => new Blob([fs.readFileSync(p)]);

(async () => {
  for (const z64 of [false, true]) {
    const blob = blobOf(mkZip(z64 ? 'z64.zip' : 'plain.zip', z64));
    const list = await Z.listEntries(blob);
    const by = (n) => list.find((e) => e.name === n);
    assert.strictEqual(list.length, 4, 'entrées');

    assert.strictEqual(await Z.readEntryText(blob, by('dossier/hello.json')), '{"ok": "é"}');
    assert.strictEqual(await Z.readEntryText(blob, by('stocke.txt')), 'tel quel', 'méthode stored');

    const all = await Z.readEntryBytes(blob, by('dossier/big.txt'));
    assert.strictEqual(all.length, big.length, 'lecture complète');

    // lecture partielle : s'arrête sans erreur
    const part = await Z.readEntryBytes(blob, by('dossier/big.txt'), { maxBytes: 1000 });
    assert.ok(part.length === 1000, 'lecture partielle : ' + part.length);
    assert.strictEqual(Buffer.from(part).toString(), '0123456789'.repeat(100));

    // gzip dans le zip
    const g = await Z.readEntryBytes(blob, by('dossier/a.txt.gz'), { gunzip: true });
    assert.ok(Buffer.from(g).toString().startsWith('contenu gzip : xxx'), 'gunzip');
    const gp = await Z.readEntryBytes(blob, by('dossier/a.txt.gz'), { gunzip: true, maxBytes: 20 });
    assert.strictEqual(gp.length, 20);
  }

  assert.ok(Z.isZip({ name: 'x.ZIP' }) && Z.isZip({ name: 'y', type: 'application/zip' }) && !Z.isZip({ name: 'a.json' }));

  // fichiers invalides
  await assert.rejects(() => Z.listEntries(new Blob(['pas un zip, mais assez long pour dépasser 22 octets'])), /ZIP/);
  await assert.rejects(() => Z.listEntries(new Blob(['x'])), /ZIP/);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('OK : lecteur ZIP (stored, deflate, zip64, partiel, gzip, erreurs).');
})().catch((e) => { console.error(e); process.exit(1); });
