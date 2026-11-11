# blur-video-app

Application web qui **floute automatiquement les données sensibles** (nom, prénom, adresse e-mail, numéro de téléphone, adresse postale) présentes dans une **image** ou une **vidéo**.

## Confidentialité

- **100 % client-side** pour le floutage : l'OCR (Tesseract.js en WebAssembly) et le floutage s'exécutent dans le navigateur. Aucune image ni vidéo n'est envoyée à un serveur.
- **Chat Mistral** (`/chat.html`) : exception à la règle ci-dessus — vos messages sont envoyés à l'API Mistral **via le serveur local**, et la clé `MISTRAL_API_KEY` reste exclusivement côté serveur (elle n'est jamais envoyée au navigateur).
- Le petit serveur Node fourni ne sert que des fichiers statiques (page + librairies embarquées) et écoute **uniquement sur `127.0.0.1`**.
- Les modèles de langue (`fra`, `eng`) et le moteur WASM sont servis localement — l'application fonctionne **hors-ligne** une fois les dépendances installées.

## Démarrage

```bash
npm install
npm start
# ouvrir http://127.0.0.1:3000
```

## Chat Mistral (`/chat.html`)

Interface de chat minimale qui appelle l'API Mistral avec le **SDK TypeScript officiel** [`@mistralai/mistralai`](https://www.npmjs.com/package/@mistralai/mistralai), modèle **`mistral-small-latest`**.

La clé API ne quitte jamais le serveur : le navigateur appelle uniquement `POST /api/chat`, et c'est `server.js` qui contacte l'API Mistral.

```bash
npm install

# renseigner la clé (jamais côté client, jamais commitée — .env est ignoré par git)
echo 'MISTRAL_API_KEY=sk-...' > .env

# lancer (choisissez une des deux commandes)
node --env-file=.env server.js        # Node >= 20.6, charge .env automatiquement
# ou, sur tout Node >= 18 :
MISTRAL_API_KEY=sk-... npm start      # Linux/macOS
export MISTRAL_API_KEY=sk-... && npm start   # Windows PowerShell

# ouvrir http://127.0.0.1:3000/chat.html
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
