/*
 * Interface commune (carte, filtres, sélection, totaux).
 * Elle ne connaît aucune source de données : tout ce qui est spécifique
 * (lecture de l'export, textes, lien vers l'activité) vient de
 * window.ACTIVITY_SOURCE, défini par le dépôt de la source. Voir README.md.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var src = window.ACTIVITY_SOURCE;
  if (!src || typeof src.loadFiles !== 'function' || typeof src.activityUrl !== 'function') {
    document.body.textContent = 'Source de données manquante ou invalide (window.ACTIVITY_SOURCE).';
    return;
  }
  var extraLabels = {};

  /* ---------- Types d'activité ---------- */

  var LABELS = {
    running: 'Course à pied', trail_running: 'Trail', treadmill_running: 'Tapis de course', track_running: 'Piste',
    cycling: 'Vélo', road_biking: 'Vélo de route', mountain_biking: 'VTT', gravel_cycling: 'Gravel',
    indoor_cycling: 'Vélo d\'appartement', virtual_ride: 'Vélo virtuel', e_bike_fitness: 'Vélo électrique', e_bike_mountain: 'VTT électrique',
    hiking: 'Randonnée', walking: 'Marche', casual_walking: 'Marche', speed_walking: 'Marche rapide',
    lap_swimming: 'Natation (piscine)', open_water_swimming: 'Natation (eau libre)', swimming: 'Natation',
    strength_training: 'Renforcement', yoga: 'Yoga', pilates: 'Pilates', cardio: 'Cardio', hiit: 'HIIT',
    elliptical: 'Elliptique', stair_climbing: 'Escaliers',
    resort_skiing_snowboarding_ws: 'Ski / snowboard (station)', resort_skiing: 'Ski alpin', cross_country_skiing_ws: 'Ski de fond',
    backcountry_skiing_snowboarding_ws: 'Ski de randonnée', snowshoeing_ws: 'Raquettes', snowshoeing: 'Raquettes',
    kayaking: 'Kayak', stand_up_paddleboarding: 'Paddle', rowing: 'Aviron', indoor_rowing: 'Rameur',
    bouldering: 'Bloc', rock_climbing: 'Escalade', golf: 'Golf', tennis: 'Tennis', multi_sport: 'Multisport',
    triathlon: 'Triathlon', other: 'Autre', unknown: 'Inconnu'
  };

  var CATS = [
    ['snow', /ski|snow|skat/],
    ['run', /run|trail|jog/],
    ['bike', /cycl|bik|ride|velo/],
    ['walk', /walk|hik|trek|mountaineer/],
    ['swim', /swim|aqua|paddl|row|kayak|surf|sail|canoe/],
    ['strength', /strength|yoga|cardio|hiit|gym|pilates|elliptical|stair|climb|boulder/]
  ];

  function category(type) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i][1].test(type)) return CATS[i][0];
    return 'other';
  }
  function typeLabel(type) {
    if (extraLabels[type]) return extraLabels[type];
    if (src.typeLabels && src.typeLabels[type]) return src.typeLabels[type];
    if (LABELS[type]) return LABELS[type];
    var s = type.replace(/_ws$/, '').replace(/_/g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ---------- Formats ---------- */

  var nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDist(m) {
    if (m === null || m === undefined) return null;
    return m < 1000 ? nf0.format(m) + ' m' : nf1.format(m / 1000) + ' km';
  }
  function fmtDur(s) {
    if (s === null || s === undefined) return null;
    if (s < 60) return Math.round(s) + ' s';
    var h = Math.floor(s / 3600);
    var mn = Math.round((s % 3600) / 60);
    if (mn === 60) { h++; mn = 0; }
    return h ? h + ' h ' + pad(mn) : mn + ' min';
  }
  function fmtElev(m) {
    return m === null || m === undefined ? null : nf0.format(m) + ' m';
  }
  function elevText(a) {
    return a.elevGainM > 0 ? 'D+ ' + fmtElev(a.elevGainM) : null;
  }
  function fmtSpeed(a) {
    if (!a.distanceM || !a.durationS || a.distanceM < 500) return null;
    var cat = category(a.type);
    if (cat === 'run' || cat === 'walk') {
      var spk = a.durationS / (a.distanceM / 1000);
      var m = Math.floor(spk / 60);
      var s = Math.round(spk % 60);
      if (s === 60) { m++; s = 0; }
      return m + ':' + pad(s) + ' /km';
    }
    if (cat === 'bike') return nf1.format((a.distanceM / 1000) / (a.durationS / 3600)) + ' km/h';
    return null;
  }
  function fmtDate(a) {
    var d = new Date(a.date + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return a.time ? d + ' · ' + a.time.replace(':', 'h') : d;
  }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function activityUrl(id) { return src.activityUrl(id); }
  function openSource(a) {
    window.open(activityUrl(a.id), '_blank', 'noopener,noreferrer');
  }
  var OPEN_LABEL = src.openLabel || 'Ouvrir l\'activité';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* ---------- Carte ---------- */

  var map = L.map('map', { worldCopyJump: true }).setView([46.6, 2.5], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">contributeurs OpenStreetMap</a>'
  }).addTo(map);
  var cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, chunkedLoading: true });
  map.addLayer(cluster);
  if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe($('map'));

  var icons = {};
  function iconFor(cat, selectedMark) {
    var key = cat + (selectedMark ? '-sel' : '');
    if (!icons[key]) {
      icons[key] = L.divIcon({
        className: 'dot-wrap',
        html: '<span class="dot cat-' + cat + (selectedMark ? ' sel' : '') + '"></span>',
        iconSize: [30, 30]
      });
    }
    return icons[key];
  }

  /* ---------- État ---------- */

  var all = [];
  var markers = {};
  var typeCounts = [];
  var selected = new Set();
  var dataMin = '';
  var dataMax = '';
  var from = '';
  var to = '';
  var filtered = [];
  var shown = 0;
  var PAGE = 100;
  var byId = {};
  var rows = [];
  var selMode = false;
  var sel = new Set();
  var selType = null;

  function buildPopup(a) {
    var box = el('div', 'pop');
    box.appendChild(el('div', 'pt', a.name || typeLabel(a.type)));
    box.appendChild(el('div', 'ps', typeLabel(a.type) + ' · ' + fmtDate(a)));
    var stats = [fmtDist(a.distanceM), elevText(a), fmtDur(a.durationS), fmtSpeed(a)].filter(Boolean).join(' · ');
    if (stats) box.appendChild(el('div', 'ps', stats));
    var link = el('a', 'go', OPEN_LABEL + ' ↗');
    link.href = activityUrl(a.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    box.appendChild(link);
    return box;
  }

  function openPopup(a, m) {
    L.popup({ maxWidth: 280, offset: [0, -6], autoPanPadding: [24, 24] })
      .setLatLng(m.getLatLng())
      .setContent(buildPopup(a))
      .openOn(map);
  }

  function setData(ds, demo) {
    all = ds.activities;
    cluster.clearLayers();
    markers = {};
    byId = {};
    sel = new Set();
    selType = null;
    setSelMode(false);
    var counts = {};
    dataMin = '9999-12-31';
    dataMax = '0000-01-01';
    all.forEach(function (a) {
      byId[a.id] = a;
      counts[a.type] = (counts[a.type] || 0) + 1;
      if (a.date < dataMin) dataMin = a.date;
      if (a.date > dataMax) dataMax = a.date;
      if (a.lat === null) return;
      var m = L.marker([a.lat, a.lon], {
        icon: iconFor(category(a.type)),
        title: a.name || typeLabel(a.type),
        riseOnHover: true
      });
      m.on('click', function () {
        if (selMode) toggleSel(a);
        else if ($('directOpen').checked) openSource(a);
        else openPopup(a, m);
      });
      markers[a.id] = m;
    });
    typeCounts = Object.keys(counts).sort(function (x, y) { return counts[y] - counts[x]; })
      .map(function (k) { return { type: k, n: counts[k] }; });
    selected = new Set(typeCounts.map(function (t) { return t.type; }));
    from = dataMin;
    to = dataMax;

    buildChips();
    syncDates();
    $('demoBanner').hidden = !demo;
    var note = $('unitsNote');
    extraLabels = ds.typeLabels || {};
    if (demo || !ds.notice) {
      note.hidden = true;
    } else {
      note.textContent = ds.notice;
      note.hidden = false;
    }
    render(true);
  }

  /* ---------- Filtres ---------- */

  function buildChips() {
    var box = $('typeChips');
    box.textContent = '';
    typeCounts.forEach(function (t) {
      var b = el('button', 'chip');
      b.type = 'button';
      b.dataset.type = t.type;
      b.appendChild(el('span', 'dotmark cat-' + category(t.type)));
      b.appendChild(el('span', '', typeLabel(t.type)));
      b.appendChild(el('span', 'n', String(t.n)));
      b.addEventListener('click', function () { toggleType(t.type); });
      box.appendChild(b);
    });
  }

  function toggleType(t) {
    if (selected.size === typeCounts.length) {
      selected = new Set([t]);
    } else if (selected.has(t)) {
      selected.delete(t);
      if (!selected.size) selected = new Set(typeCounts.map(function (x) { return x.type; }));
    } else {
      selected.add(t);
    }
    render(true);
  }

  function syncDates() {
    var f = $('dateFrom'), t = $('dateTo');
    f.min = t.min = dataMin;
    f.max = t.max = dataMax > ymd(new Date()) ? dataMax : ymd(new Date());
    f.value = from;
    t.value = to;
  }

  function applyPreset(p) {
    if (!all.length) return;
    if (p === 'all') {
      from = dataMin; to = dataMax;
    } else {
      var now = new Date();
      var d = new Date(now);
      if (p === '30d') d.setDate(d.getDate() - 30);
      else if (p === '3m') d.setMonth(d.getMonth() - 3);
      else if (p === '12m') d.setFullYear(d.getFullYear() - 1);
      else if (p === 'year') d = new Date(now.getFullYear(), 0, 1);
      from = ymd(d);
      to = ymd(now) > dataMax ? ymd(now) : dataMax;
    }
    syncDates();
    render(true);
  }

  function render(fit) {
    filtered = all.filter(function (a) { return selected.has(a.type) && a.date >= from && a.date <= to; });

    var ms = [];
    var km = 0;
    filtered.forEach(function (a) {
      var m = markers[a.id];
      if (m) ms.push(m);
      if (a.distanceM) km += a.distanceM / 1000;
    });
    cluster.clearLayers();
    cluster.addLayers(ms);
    if (fit && ms.length) {
      map.fitBounds(L.latLngBounds(ms.map(function (m) { return m.getLatLng(); })), { padding: [30, 30], maxZoom: 13 });
    }

    var parts = [filtered.length + (filtered.length > 1 ? ' activités' : ' activité')];
    if (km > 0) parts.push(nf0.format(km) + ' km');
    $('summary').textContent = all.length ? parts.join(' · ') : 'Aucune activité chargée';

    Array.prototype.forEach.call($('typeChips').children, function (c) {
      c.setAttribute('aria-pressed', String(selected.has(c.dataset.type)));
    });

    renderList();
  }

  function renderList() {
    $('list').textContent = '';
    rows = [];
    shown = 0;
    appendMore();
    refreshRows();
  }

  function itemEl(a) {
    var li = el('li');
    var b = el('button', 'item');
    b.type = 'button';
    if (selMode) {
      b.setAttribute('role', 'checkbox');
      b.appendChild(el('span', 'box'));
    }
    b.appendChild(el('span', 'dotmark cat-' + category(a.type)));
    var txt = el('span', 'txt');
    txt.appendChild(el('span', 't1', a.name || typeLabel(a.type)));
    var meta = [typeLabel(a.type), fmtDate(a), fmtDist(a.distanceM), elevText(a), fmtDur(a.durationS)].filter(Boolean).join(' · ');
    var has = !!markers[a.id];
    txt.appendChild(el('span', 't2', has ? meta : meta + ' · pas de position'));
    b.appendChild(txt);
    if (selMode) {
      b.addEventListener('click', function () { toggleSel(a); });
    } else if (has) {
      b.addEventListener('click', function () { focusActivity(a); });
    } else {
      b.disabled = true;
    }
    rows.push({ a: a, b: b });
    li.appendChild(b);

    var link = el('a', 'ext', '↗');
    link.href = activityUrl(a.id);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = OPEN_LABEL;
    link.setAttribute('aria-label', OPEN_LABEL + ' : ' + (a.name || typeLabel(a.type)));
    li.appendChild(link);
    return li;
  }

  function appendMore() {
    var frag = document.createDocumentFragment();
    var end = Math.min(filtered.length, shown + PAGE);
    for (var i = shown; i < end; i++) frag.appendChild(itemEl(filtered[i]));
    $('list').appendChild(frag);
    shown = end;
    var rest = filtered.length - shown;
    $('btnMore').hidden = rest <= 0;
    $('btnMore').textContent = 'Afficher plus (' + rest + ')';
    if (!filtered.length && all.length) $('list').appendChild(el('li', 'muted small', 'Aucune activité pour ces filtres.'));
    refreshRows();
  }

  function focusActivity(a) {
    var m = markers[a.id];
    if (!m) return;
    cluster.zoomToShowLayer(m, function () {
      if (map.getZoom() < 13) map.setView(m.getLatLng(), 13);
      openPopup(a, m);
    });
  }

  /* ---------- Sélection et addition ---------- */

  function setSelMsg(text) { $('selMsg').textContent = text || ''; }

  function markSelected(a) {
    var m = markers[a.id];
    if (m) m.setIcon(iconFor(category(a.type), sel.has(a.id)));
  }

  function refreshRows() {
    rows.forEach(function (r) {
      if (selMode) {
        r.b.setAttribute('aria-checked', String(sel.has(r.a.id)));
        var other = !!selType && r.a.type !== selType;
        r.b.classList.toggle('dim', other);
        if (other) r.b.setAttribute('aria-disabled', 'true'); else r.b.removeAttribute('aria-disabled');
      } else {
        r.b.removeAttribute('aria-checked');
        r.b.classList.remove('dim');
      }
    });
  }

  function updateSelUI() {
    var n = sel.size;
    selType = n ? byId[sel.values().next().value].type : null;
    $('selInfo').textContent = n
      ? n + (n > 1 ? ' sélectionnées' : ' sélectionnée') + ' · ' + typeLabel(selType)
      : 'Touchez des activités du même type pour les additionner.';
    $('btnSum').disabled = n < 2;
    $('btnSum').textContent = n >= 2 ? 'Additionner (' + n + ')' : 'Additionner';
    refreshRows();
  }

  function toggleSel(a) {
    if (sel.has(a.id)) {
      sel.delete(a.id);
    } else {
      if (selType && selType !== a.type) {
        setSelMsg('Seules des activités du même type peuvent être additionnées (« ' + typeLabel(selType) + ' »).');
        return;
      }
      sel.add(a.id);
    }
    setSelMsg('');
    markSelected(a);
    updateSelUI();
  }

  function clearSel() {
    var old = Array.from(sel);
    sel.clear();
    old.forEach(function (id) { markSelected(byId[id]); });
    setSelMsg('');
    updateSelUI();
  }

  function selectAll() {
    var t = selType;
    if (!t) {
      var types = {};
      filtered.forEach(function (a) { types[a.type] = true; });
      var keys = Object.keys(types);
      if (keys.length === 1) t = keys[0];
    }
    if (!t) {
      setSelMsg('Choisissez d\'abord un type : filtrez par type ou touchez une activité.');
      return;
    }
    filtered.forEach(function (a) {
      if (a.type === t && !sel.has(a.id)) { sel.add(a.id); markSelected(a); }
    });
    setSelMsg('');
    updateSelUI();
  }

  function setSelMode(on) {
    selMode = on;
    if (!on) clearSel();
    map.closePopup();
    $('btnSelMode').setAttribute('aria-pressed', String(on));
    $('btnSelMode').textContent = on ? 'Terminer' : 'Sélectionner';
    $('selBar').hidden = !on;
    updateSelUI();
    if (all.length) renderList();
  }

  function fmtDay(d) {
    return new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  function stat(label, value, sub, wide) {
    var d = el('div', wide ? 'stat wide' : 'stat');
    d.appendChild(el('span', 'sl', label));
    d.appendChild(el('span', 'sv', value));
    if (sub) d.appendChild(el('span', 'ss', sub));
    return d;
  }

  function closeTotals() { $('sumDialog').hidden = true; }

  function showTotals() {
    var acts = Array.from(sel).map(function (id) { return byId[id]; })
      .sort(function (x, y) { return y.startMs - x.startMs; });
    if (!acts.length) { closeTotals(); return; }
    var ag = ActivityAggregate.aggregate(acts);
    var body = $('sumBody');
    body.textContent = '';
    if (ag.error) {
      body.appendChild(el('p', 'sumnote', 'Seules des activités du même type peuvent être additionnées.'));
      $('sumTitle').textContent = 'Total';
      $('sumDialog').hidden = false;
      return;
    }
    $('sumTitle').textContent = 'Total · ' + typeLabel(ag.type);

    var grid = el('div', 'stats');
    grid.appendChild(stat('Activités', String(ag.count)));
    grid.appendChild(stat('Distance totale', ag.withDistance ? fmtDist(ag.totalDistanceM) : '—'));
    grid.appendChild(stat('Durée totale', ag.withDuration ? fmtDur(ag.totalDurationS) : '—'));
    if (ag.withElevation) {
      grid.appendChild(stat('Dénivelé positif total', fmtElev(ag.totalElevationGainM)));
      grid.appendChild(stat('D+ moyen', fmtElev(ag.avgElevationGainM), 'par activité'));
    }
    var cat = category(ag.type);
    var sp = fmtSpeed({ type: ag.type, distanceM: ag.paceDistanceM, durationS: ag.paceDurationS });
    if (sp) grid.appendChild(stat(cat === 'bike' ? 'Vitesse moyenne' : 'Allure moyenne', sp));
    if (ag.avgDistanceM) grid.appendChild(stat('Distance moyenne', fmtDist(ag.avgDistanceM)));
    if (ag.longest) grid.appendChild(stat('Plus longue', fmtDist(ag.longest.distanceM), fmtDay(ag.longest.date)));
    grid.appendChild(stat('Période',
      ag.firstDate === ag.lastDate ? fmtDay(ag.firstDate) : fmtDay(ag.firstDate) + ' → ' + fmtDay(ag.lastDate), '', true));
    body.appendChild(grid);

    var missing = [];
    if (ag.withDistance < ag.count) missing.push((ag.count - ag.withDistance) + ' sans distance (non comptée(s) dans la distance)');
    if (ag.withDuration < ag.count) missing.push((ag.count - ag.withDuration) + ' sans durée (non comptée(s) dans la durée)');
    if (ag.withElevation && ag.withElevation < ag.count) missing.push((ag.count - ag.withElevation) + ' sans dénivelé (non comptée(s) dans le dénivelé)');
    if (missing.length) body.appendChild(el('p', 'sumnote', 'Activités incomplètes : ' + missing.join(' ; ') + '.'));

    var ul = el('ul', 'sumlist');
    acts.forEach(function (a) {
      var li = el('li');
      var txt = el('span', 'txt');
      txt.appendChild(el('span', 't1', a.name || typeLabel(a.type)));
      txt.appendChild(el('span', 't2', [fmtDay(a.date), fmtDist(a.distanceM), elevText(a), fmtDur(a.durationS)].filter(Boolean).join(' · ')));
      li.appendChild(txt);
      var x = el('button', 'x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Retirer de la sélection : ' + (a.name || typeLabel(a.type)));
      x.addEventListener('click', function () { toggleSel(a); showTotals(); });
      li.appendChild(x);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    $('sumDialog').hidden = false;
    $('btnSumClose').focus();
  }

  /* ---------- Import ---------- */

  function showWelcome() {
    $('btnClose').hidden = !all.length;
    $('errors').textContent = '';
    $('welcome').hidden = false;
    $('fileInput').focus();
  }
  function hideWelcome() { $('welcome').hidden = true; }

  function progress(done, total, label) {
    $('busy').textContent = (label || 'Lecture en cours') + (total ? ' ' + done + ' / ' + total : '…');
  }

  async function handleFiles(files) {
    if (!files || !files.length) return;
    $('busy').hidden = false;
    progress(0, 0);
    $('errors').textContent = '';
    try {
      var res = await src.loadFiles(files, progress);
      res.errors.forEach(function (e) { $('errors').appendChild(el('li', '', e)); });
      if (res.dataset.activities.length) {
        setData(res.dataset, false);
        if (!res.errors.length) hideWelcome();
        else $('btnClose').hidden = false;
      }
    } catch (e) {
      $('errors').appendChild(el('li', '', 'Lecture impossible : ' + (e && e.message ? e.message : 'erreur inconnue.')));
    } finally {
      $('busy').hidden = true;
      $('fileInput').value = '';
    }
  }

  async function loadDemo() {
    try {
      var ds = await src.loadDemo();
      setData(ds, true);
      hideWelcome();
    } catch (e) {
      $('errors').appendChild(el('li', '', 'Données de démonstration introuvables.'));
    }
  }

  /* ---------- Textes de la source ---------- */

  function fillSteps(ol, steps) {
    ol.textContent = '';
    (steps || []).forEach(function (step) {
      var li = el('li');
      (Array.isArray(step) ? step : [step]).forEach(function (seg) {
        if (typeof seg === 'string') {
          li.appendChild(document.createTextNode(seg));
        } else if (seg && seg.code) {
          li.appendChild(el('code', '', String(seg.code)));
        } else if (seg && seg.href && /^https:\/\//.test(seg.href)) {
          var a = el('a', '', String(seg.text || seg.href));
          a.href = seg.href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          li.appendChild(a);
        }
      });
      ol.appendChild(li);
    });
  }

  function renderTexts() {
    var t = src.texts || {};
    $('welcomeTitle').textContent = t.title || 'Mes activités sur une carte';
    $('welcomeLead').textContent = t.lead || '';
    var pv = t.privacy || '';
    var cut = pv.indexOf('. ');
    $('privacyLead').textContent = cut > 0 ? pv.slice(0, cut + 1) : '';
    $('privacyText').textContent = cut > 0 ? ' ' + pv.slice(cut + 2) : pv;
    $('privacyBox').hidden = !t.privacy;
    $('importLabel').textContent = t.importButton || 'Choisir le fichier d\'export';
    $('dropHint').textContent = t.dropHint || '';
    $('helpTitle').textContent = t.helpTitle || 'Comment obtenir l\'export';
    fillSteps($('helpSteps'), t.helpSteps);
    $('helpNote').textContent = t.helpNote || '';
    $('directOpenText').textContent = t.directOpen || 'Ouvrir l\'activité directement au clic sur la carte';
    $('demoBanner').textContent = t.demoBanner || 'Données fictives de démonstration.';
    $('fileInput').accept = src.accept || '';
    $('btnDemo').hidden = typeof src.loadDemo !== 'function';
  }
  renderTexts();

  /* ---------- Événements ---------- */

  $('fileInput').addEventListener('change', function (e) { handleFiles(e.target.files); });
  $('btnDemo').addEventListener('click', loadDemo);
  $('btnClose').addEventListener('click', hideWelcome);
  $('btnImport').addEventListener('click', showWelcome);
  $('btnHelp').addEventListener('click', showWelcome);
  $('btnMore').addEventListener('click', appendMore);
  $('btnAllTypes').addEventListener('click', function () {
    selected = new Set(typeCounts.map(function (t) { return t.type; }));
    render(true);
  });
  $('presets').addEventListener('click', function (e) {
    var p = e.target.closest('[data-preset]');
    if (p) applyPreset(p.dataset.preset);
  });
  $('dateFrom').addEventListener('change', function (e) {
    from = e.target.value || dataMin;
    if (from > to) to = from;
    syncDates();
    render(true);
  });
  $('dateTo').addEventListener('change', function (e) {
    to = e.target.value || dataMax;
    if (to < from) from = to;
    syncDates();
    render(true);
  });
  $('sheetToggle').addEventListener('click', function () {
    var collapsed = $('panel').classList.toggle('collapsed');
    this.setAttribute('aria-expanded', String(!collapsed));
  });
  $('btnSelMode').addEventListener('click', function () { setSelMode(!selMode); });
  $('btnSelQuit').addEventListener('click', function () { setSelMode(false); });
  $('btnSelClear').addEventListener('click', clearSel);
  $('btnSelAll').addEventListener('click', selectAll);
  $('btnSum').addEventListener('click', showTotals);
  $('btnSumClose').addEventListener('click', closeTotals);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('sumDialog').hidden) closeTotals();
    else if (!$('welcome').hidden && all.length) hideWelcome();
  });

  var dz = $('dropzone');
  document.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag'); });
  document.addEventListener('dragleave', function () { dz.classList.remove('drag'); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    dz.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files.length) {
      if ($('welcome').hidden) showWelcome();
      handleFiles(e.dataTransfer.files);
    }
  });
})();
