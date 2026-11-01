/*
 * Addition d'activités. Fonction pure, sans accès au DOM.
 * Seules des activités d'un même type peuvent être additionnées.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ActivityAggregate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** @param {Array} acts activités normalisées (voir parse.js) */
  function aggregate(acts) {
    if (!acts || !acts.length) return { error: 'empty' };
    var type = acts[0].type;
    for (var i = 1; i < acts.length; i++) {
      if (acts[i].type !== type) return { error: 'mixed' };
    }
    var r = {
      type: type,
      count: acts.length,
      withDistance: 0,
      withDuration: 0,
      totalDistanceM: 0,
      totalDurationS: 0,
      // base du calcul de l'allure/vitesse : uniquement les activités ayant les deux valeurs
      paceDistanceM: 0,
      paceDurationS: 0,
      withElevation: 0,
      totalElevationGainM: 0,
      longest: null,
      firstDate: null,
      lastDate: null
    };
    acts.forEach(function (a) {
      var hasD = a.distanceM > 0;
      var hasT = a.durationS > 0;
      if (hasD) {
        r.withDistance++;
        r.totalDistanceM += a.distanceM;
        if (!r.longest || a.distanceM > r.longest.distanceM) r.longest = a;
      }
      if (hasT) {
        r.withDuration++;
        r.totalDurationS += a.durationS;
      }
      if (hasD && hasT) {
        r.paceDistanceM += a.distanceM;
        r.paceDurationS += a.durationS;
      }
      if (typeof a.elevGainM === 'number' && a.elevGainM >= 0) {
        r.withElevation++;
        r.totalElevationGainM += a.elevGainM;
      }
      if (r.firstDate === null || a.date < r.firstDate) r.firstDate = a.date;
      if (r.lastDate === null || a.date > r.lastDate) r.lastDate = a.date;
    });
    r.avgDistanceM = r.withDistance ? r.totalDistanceM / r.withDistance : null;
    r.avgElevationGainM = r.withElevation ? r.totalElevationGainM / r.withElevation : null;
    return r;
  }

  return { aggregate: aggregate };
});
