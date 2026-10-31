# blur-video-app

Application web qui **floute automatiquement les données sensibles** (nom, prénom, adresse e-mail, numéro de téléphone, adresse postale) présentes dans une **image** ou une **vidéo**.

## Confidentialité

- **100 % client-side** : l'OCR (Tesseract.js en WebAssembly) et le floutage s'exécutent dans le navigateur. Aucune image ni vidéo n'est envoyée à un serveur.
- Le petit serveur Node fourni ne sert que des fichiers statiques (page + librairies embarquées) et écoute **uniquement sur `127.0.0.1`**.
- Les modèles de langue (`fra`, `eng`) et le moteur WASM sont servis localement — l'application fonctionne **hors-ligne** une fois les dépendances installées.

## Démarrage

```bash
npm install
npm start
# ouvrir http://127.0.0.1:3000
```

## Utilisation

1. Glissez-déposez une image ou une vidéo.
2. Choisissez la langue OCR et l'intensité du flou.
3. Cliquez sur **Analyser et flouter**.
4. Téléchargez le résultat (PNG pour une image, WebM pour une vidéo).

## Fonctionnement

1. **OCR** : Tesseract extrait le texte et les coordonnées de chaque mot.
2. **Détection** (`public/js/sensitive.js`) : des règles (expressions rationnelles FR/INTL) repèrent e-mails, téléphones (`06…`, `+33…`), adresses (`12 rue des Lilas`, `75020 Paris`), mentions « Nom : … ».
3. **Floutage** : les zones correspondantes sont floutées sur un `<canvas>` (filtre `blur()`), image par image pour la vidéo, puis ré-encodées en WebM via `MediaRecorder`.

## Limites

- La détection par règles manque les noms/prénoms sans étiquette « Nom : ». Une V2 pourra ajouter un modèle NER local (ex. transformers.js).
- L'OCR est plus fiable sur des images nettes et bien cadrées.

## Tests

```bash
npm test
```
