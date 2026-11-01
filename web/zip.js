/*
 * Lecteur ZIP minimal, 100 % local (aucune requête réseau).
 * - lit le répertoire central sans charger l'archive en mémoire ;
 * - décompresse une entrée à la demande (stored / deflate), avec un plafond d'octets ;
 * - option gunzip : pour les fichiers .gz contenus dans l'archive (ex. .fit.gz de Strava).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ActivityZip = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_ENTRY_BYTES = 300 * 1024 * 1024; // garde-fou (archive piégée)
  var MAX_CD_BYTES = 256 * 1024 * 1024;

  function u16(dv, o) { return dv.getUint16(o, true); }
  function u32(dv, o) { return dv.getUint32(o, true); }
  function u64(dv, o) { return Number(dv.getBigUint64(o, true)); }

  async function readRange(blob, start, end) {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer());
  }

  /** @returns {Promise<Array<{name,flags,method,comp,uncomp,offset}>>} */
  async function listEntries(blob) {
    var size = blob.size;
    if (size < 22) throw new Error('Fichier ZIP invalide ou vide.');
    var tailLen = Math.min(size, 22 + 65535 + 20);
    var tail = await readRange(blob, size - tailLen, size);
    var dv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    var eocd = -1;
    for (var i = tail.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("Ce fichier n'est pas une archive ZIP valide.");

    var entries = u16(dv, eocd + 10);
    var cdSize = u32(dv, eocd + 12);
    var cdOffset = u32(dv, eocd + 16);

    if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      var loc = eocd - 20;
      if (loc < 0 || dv.getUint32(loc, true) !== 0x07064b50) throw new Error('Archive ZIP64 illisible.');
      var z64 = u64(dv, loc + 8);
      var rec = await readRange(blob, z64, z64 + 56);
      var rdv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
      if (rdv.getUint32(0, true) !== 0x06064b50) throw new Error('Archive ZIP64 illisible.');
      entries = u64(rdv, 32);
      cdSize = u64(rdv, 40);
      cdOffset = u64(rdv, 48);
    }

    if (cdSize > MAX_CD_BYTES) throw new Error('Archive ZIP anormalement structurée.');
    var cd = await readRange(blob, cdOffset, cdOffset + cdSize);
    var cdv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    var dec = new TextDecoder('utf-8');
    var out = [];
    var p = 0;
    while (p + 46 <= cd.length && cdv.getUint32(p, true) === 0x02014b50) {
      var flags = u16(cdv, p + 8);
      var method = u16(cdv, p + 10);
      var comp = u32(cdv, p + 20);
      var uncomp = u32(cdv, p + 24);
      var nameLen = u16(cdv, p + 28);
      var extraLen = u16(cdv, p + 30);
      var commentLen = u16(cdv, p + 32);
      var offset = u32(cdv, p + 42);
      var name = dec.decode(cd.subarray(p + 46, p + 46 + nameLen));

      var e = p + 46 + nameLen;
      var eEnd = e + extraLen;
      while (e + 4 <= eEnd) {
        var id = u16(cdv, e);
        var len = u16(cdv, e + 2);
        if (id === 0x0001) {
          var q = e + 4;
          if (uncomp === 0xffffffff) { uncomp = u64(cdv, q); q += 8; }
          if (comp === 0xffffffff) { comp = u64(cdv, q); q += 8; }
          if (offset === 0xffffffff) { offset = u64(cdv, q); q += 8; }
        }
        e += 4 + len;
      }
      out.push({ name: name, flags: flags, method: method, comp: comp, uncomp: uncomp, offset: offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  }

  /**
   * Lit le contenu d'une entrée.
   * @param {Blob} blob archive
   * @param {object} entry entrée de listEntries
   * @param {{maxBytes?:number, gunzip?:boolean}} [opts]
   *   maxBytes : s'arrête après N octets (lecture partielle, résultat tronqué sans erreur)
   *   gunzip   : l'entrée contient un fichier .gz, à décompresser aussi
   * @returns {Promise<Uint8Array>}
   */
  async function readEntryBytes(blob, entry, opts) {
    opts = opts || {};
    var limit = Math.min(opts.maxBytes || MAX_ENTRY_BYTES, MAX_ENTRY_BYTES);
    var partial = !!opts.maxBytes;
    if (entry.flags & 1) throw new Error('Archive chiffrée : non prise en charge.');
    if (!partial && entry.uncomp > MAX_ENTRY_BYTES) throw new Error('Un fichier de l\'archive est trop volumineux.');
    var head = await readRange(blob, entry.offset, entry.offset + 30);
    var hdv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (hdv.getUint32(0, true) !== 0x04034b50) throw new Error('Archive ZIP corrompue.');
    var start = entry.offset + 30 + u16(hdv, 26) + u16(hdv, 28);
    var raw = blob.slice(start, start + entry.comp);
    var stream;
    if (entry.method === 0) {
      stream = raw.stream();
    } else if (entry.method === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Ce navigateur ne sait pas décompresser les ZIP. Utilisez un navigateur récent (Chrome, Firefox, Safari 16.4+).');
      }
      stream = raw.stream().pipeThrough(new DecompressionStream('deflate-raw'));
    } else {
      throw new Error('Méthode de compression ZIP non prise en charge.');
    }
    if (opts.gunzip) {
      if (typeof DecompressionStream === 'undefined') throw new Error('Décompression gzip non disponible dans ce navigateur.');
      stream = stream.pipeThrough(new DecompressionStream('gzip'));
    }
    var reader = stream.getReader();
    var chunks = [];
    var total = 0;
    try {
      for (;;) {
        var r = await reader.read();
        if (r.done) break;
        total += r.value.length;
        chunks.push(r.value);
        if (total >= limit) {
          if (!partial) throw new Error('Un fichier de l\'archive est trop volumineux.');
          await reader.cancel();
          break;
        }
      }
    } catch (err) {
      try { await reader.cancel(); } catch (e2) { /* ignore */ }
      throw err;
    }
    var buf = new Uint8Array(Math.min(total, limit));
    var pos = 0;
    for (var k = 0; k < chunks.length && pos < buf.length; k++) {
      var c = chunks[k];
      if (pos + c.length > buf.length) c = c.subarray(0, buf.length - pos);
      buf.set(c, pos);
      pos += c.length;
    }
    return buf;
  }

  async function readEntryText(blob, entry, opts) {
    return new TextDecoder('utf-8').decode(await readEntryBytes(blob, entry, opts));
  }

  function isZip(file) {
    return /\.zip$/i.test(file.name || '') || !!(file.type && /zip/.test(file.type));
  }

  return { listEntries: listEntries, readEntryBytes: readEntryBytes, readEntryText: readEntryText, isZip: isZip };
});
