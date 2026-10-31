import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSensitive, mergeOverlaps } from '../public/js/sensitive.js';

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
