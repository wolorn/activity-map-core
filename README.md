# activity-map-core

Interface commune des sites « mes activités sur une carte » : carte interactive (Leaflet + OpenStreetMap), filtres par type et par date, sélection et addition d'activités du même type (distance, durée, dénivelé, allure ou vitesse), utilisable sur smartphone. Ce dépôt **ne contient aucune source de données** : chaque site a son propre dépôt, qui fournit la lecture de son export et ses textes.

| Dépôt | Rôle |
| --- | --- |
| `activity-map-core` (celui-ci) | interface, lecteur ZIP, script d'assemblage, tests communs |
| `garmin-map` | source Garmin (`summarizedActivities.json`) |
| `strava-map` | source Strava (`activities.csv` + traces FIT/GPX) |

## Principe de sécurité

Le site est 100 % statique : aucun serveur, aucun identifiant demandé, les fichiers d'export sont lus dans le navigateur et ne sont envoyés nulle part. La page porte une politique de sécurité du contenu stricte (`script-src 'self'`, pas de script ni de style en ligne, pas de CDN) ; seules les tuiles de carte OpenStreetMap sont chargées depuis l'extérieur. Leaflet est fourni dans `web/vendor/`.

## Comment une source utilise ce dépôt

Chaque dépôt de source contient un fichier `CORE_VERSION` (un tag, par exemple `v1.0.0`, ou un hash de commit). Son workflow GitHub Actions :

1. récupère ce dépôt à cette version exacte ;
2. exécute les tests ;
3. lance `node core/tools/build.js --source . --out dist`, qui copie `web/` et y ajoute les fichiers de la source ;
4. publie `dist/` sur GitHub Pages.

Un site ne change donc que lorsqu'on modifie `CORE_VERSION` dans son dépôt : on peut faire évoluer ce dépôt sans rien casser, puis mettre à jour chaque site quand on le décide.

### Publier une nouvelle version du commun

```bash
git tag v1.1.0 && git push origin v1.1.0
# puis, dans chaque dépôt de source : echo v1.1.0 > CORE_VERSION, commit, push
```

Utiliser un tag ou un hash de commit, jamais `main` : sinon le site changerait à chaque modification du commun.
Ce dépôt doit être **public** (le workflow le récupère sans jeton). Il ne contient aucune donnée personnelle.

### Assembler en local

```bash
node tools/build.js --source ../garmin-map --out /tmp/site
python3 -m http.server 8000 --directory /tmp/site   # http://localhost:8000
```

## Contrat d'une source

Le dépôt de la source contient :

- `activity-source.json` : `{ "title": "…", "scripts": ["a.js", "source.js"], "files": ["demo-data.js"] }`. `scripts` sont chargés dans l'ordre avant `app.js` ; `files` sont copiés tels quels. Seuls les fichiers listés sont publiés ; les noms réservés (`app.js`, `zip.js`, `vendor/`…) sont refusés.
- un script qui définit `window.ACTIVITY_SOURCE` :

```js
window.ACTIVITY_SOURCE = {
  id: 'maSource',
  accept: '.zip,.json',                       // types proposés dans le sélecteur de fichier
  openLabel: 'Ouvrir dans Machin',            // libellé du lien vers l'activité
  activityUrl: (id) => 'https://…/' + encodeURIComponent(id),
  typeLabels: { workout: 'Séance' },          // libellés de types en plus de ceux du commun (facultatif)
  texts: {                                    // textes de l'écran d'accueil et de l'aide
    title, lead, privacy, importButton, dropHint, helpTitle, helpNote, directOpen, demoBanner,
    helpSteps: [ ['texte ', { href: 'https://…', text: 'lien' }, ' ', { code: 'fichier.json' }], 'étape simple' ]
  },
  loadFiles: async (files, onProgress) => ({ dataset, errors: ['message', …] }),
  loadDemo: async () => dataset               // facultatif : affiche le bouton de démonstration
};
```

`onProgress(fait, total, libellé)` permet d'afficher l'avancement d'une lecture longue.

Un `dataset` est un objet :

```js
{
  activities: [{
    id: '123',                  // chiffres uniquement (sert à construire l'URL)
    name: '…', type: 'running', // clé de type : voir web/app.js (LABELS) ; une clé inconnue est affichée telle quelle
    startMs: 1700000000000,     // début, millisecondes UTC (sert au tri)
    date: '2026-10-25',         // YYYY-MM-DD, sert aux filtres
    time: '13:54' | null,       // heure locale, facultatif
    lat, lon,                   // degrés, ou null si pas de position (l'activité reste dans la liste)
    distanceM: 12345 | null, durationS: 3600 | null, elevGainM: 250 | null
  }],
  typeLabels: { clé: 'Libellé' },  // facultatif, pour les types propres à la source
  notice: 'texte affiché sous « Période »'   // facultatif : unités retenues, avertissements
}
```

Le commun fournit `ActivityZip` (`zip.js`) : `listEntries`, `readEntryText`, `readEntryBytes(blob, entry, { maxBytes, gunzip })`, `isZip`. Les textes de la source sont toujours insérés via `textContent` ; seuls des liens `https://` sont acceptés dans l'aide.

## Tests

```bash
node test/zip.test.js        # lecteur ZIP (stocké, deflate, zip64, lecture partielle, gzip)
node test/aggregate.test.js  # addition d'activités
node test/build.test.js      # assemblage et refus des entrées dangereuses
```
(Python 3 est utilisé pour fabriquer les archives de test.)
