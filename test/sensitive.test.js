import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSensitive, mergeOverlaps, collectWords, boxesFromWords, wordMatchesHit } from '../public/js/sensitive.js';

test('détecte un email', () => {
  const hits = detectSensitive('Contact : jean.dupont@example.fr svp');
  assert.ok(hits.some((h) => h.type === 'email' && h.text.includes('jean.dupont@example.fr')));
});

test('détecte un téléphone FR 06 et +33', () => {
  const hits = detectSensitive('Tél 06 12 34 56 78 ou +33 6 12 34 56 78');
  const tels = hits.filter((h) => h.type === 'telephone');
  assert.equal(tels.length, 2);
});

test('détecte une adresse postale avec rue', () => {
  const hits = detectSensitive('12 rue des Lilas, 75020 Paris');
  assert.ok(hits.some((h) => h.type === 'adresse' && h.text.toLowerCase().includes('rue des lilas')));
  assert.ok(hits.some((h) => h.type === 'adresse' && h.text.includes('75020')));
});

test('détecte "Nom : Dupont"', () => {
  const hits = detectSensitive('Nom : Martin  Prénom : Sophie');
  assert.ok(hits.some((h) => h.type === 'nom' && /Martin/.test(h.text)));
});

test('ne déclenche rien sur un texte banal', () => {
  const hits = detectSensitive('Bonjour, voici le rapport de réunion de mardi.');
  assert.equal(hits.length, 0);
});

test('mergeOverlaps fusionne les chevauchements', () => {
  const merged = mergeOverlaps([
    { type: 'email', text: 'a@b.fr', start: 0, end: 6 },
    { type: 'telephone', text: '06', start: 4, end: 9 }
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].types.sort(), ['email', 'telephone']);
});

test('collectWords aplati l’arbre blocks v5 de tesseract.js', () => {
  const data = {
    text: 'Nom : Martin',
    blocks: [{
      paragraphs: [{
        lines: [{
          words: [
            { text: 'Nom', bbox: { x0: 1, y0: 2, x1: 30, y1: 20 } },
            { text: ':', bbox: { x0: 32, y0: 2, x1: 36, y1: 20 } },
            { text: 'Martin', bbox: { x0: 40, y0: 2, x1: 90, y1: 20 } }
          ]
        }]
      }]
    }]
  };
  const words = collectWords(data);
  assert.equal(words.length, 3);
  assert.equal(words[2].text, 'Martin');
  assert.equal(collectWords({}).length, 0);
  assert.equal(collectWords({ blocks: null }).length, 0);
});

test('boxesFromWords retourne les bboxes des mots correspondant aux détections', () => {
  const text = 'Contact jean.dupont@example.fr ou 06 12 34 56 78, merci';
  const hits = mergeOverlaps(detectSensitive(text));
  const words = [
    { text: 'Contact', bbox: { x0: 0, y0: 0, x1: 50, y1: 10 } },
    { text: 'jean.dupont@example.fr', bbox: { x0: 60, y0: 0, x1: 200, y1: 10 } },
    { text: '06', bbox: { x0: 220, y0: 0, x1: 235, y1: 10 } },
    { text: '12', bbox: { x0: 240, y0: 0, x1: 255, y1: 10 } },
    { text: 'merci', bbox: { x0: 300, y0: 0, x1: 340, y1: 10 } }
  ];
  const boxes = boxesFromWords(words, hits);
  assert.deepEqual(boxes.map((b) => b.x), [60, 220, 240]);
  assert.equal(boxes[0].w, 140);
});

test('wordMatchesHit ignore la casse et la ponctuation, et les mots d’un seul caractère', () => {
  const hits = mergeOverlaps(detectSensitive('12 rue des Lilas, 75020 Paris'));
  assert.ok(wordMatchesHit('Lilas,', hits));
  assert.ok(wordMatchesHit('rue', hits));
  assert.ok(!wordMatchesHit('a', hits));
  assert.ok(!wordMatchesHit('', hits));
});
