// Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

test('probit y d prima', () => {
  assert.ok(Math.abs(L.probit(0.975) - 1.96) < 0.001);
  assert.ok(Math.abs(L.probit(0.5)) < 1e-9);
  assert.ok(L.dprime(18, 2, 2, 18) > 2);
  assert.ok(Math.abs(L.dprime(10, 10, 10, 10)) < 1e-9);
});

test('recuerdo de palabras tolera acentos, plurales y errores de una letra', () => {
  const r = L.matchRecall(L.toWords('Limón caballos ventanaa perro el rio'), ['botella', 'caballo', 'ventana', 'limón', 'río']);
  assert.deepEqual(r.correct, ['caballo', 'ventana', 'limón', 'río']);
  assert.deepEqual(r.intrusions, ['perro']);
});

test('fluidez cuenta palabras únicas que empiezan por la letra', () => {
  const r = L.fluencyCount(L.toWords('pera perro perros pues mesa Pájaro pera'), 'P');
  assert.deepEqual(r.valid, ['pera', 'perro', 'pajaro']);
});

test('torre de Londres: problemas con el mínimo de movimientos pedido y alcanzable', () => {
  for (let m = 2; m <= 7; m++) {
    const p = L.tolProblem(m);
    assert.equal(L.tolDistances(p.start).get(L.tolKey(p.goal)).d, p.min);
    assert.equal(p.min, m);
  }
  assert.equal(L.tolMove([['R', 'V', 'A'], [], []], 0, 2)[2][0], 'A');
  assert.equal(L.tolMove([[], [], ['R']], 1, 0), null);
});

test('series: respuestas enteras positivas en todas las dificultades', () => {
  for (let d = 1; d <= 8; d++) for (let k = 0; k < 300; k++) {
    const s = L.genSeries(d);
    assert.ok(s.shown.length >= 5);
    assert.ok(Number.isInteger(s.answer) && s.answer > 0, `dificultad ${d}: ${s.shown} -> ${s.answer}`);
  }
});

test('n-back marca bien los objetivos', () => {
  const { seq, isTarget } = L.genNback(3, 200, 0.3, ['B', 'F', 'K', 'M']);
  seq.forEach((l, i) => assert.equal(isTarget[i], i >= 3 && l === seq[i - 3]));
});

test('nivel adaptativo y selección de juegos por dominio', () => {
  assert.equal(L.nextLevel(3, 0.9), 4);
  assert.equal(L.nextLevel(1, 0.2), 1);
  assert.equal(L.nextLevel(10, 1), 10);
  const cfg = { a: { peso: 1, dominio: 'm' }, b: { peso: 1, dominio: 'm' }, c: { peso: 1, dominio: 'e' }, d: { peso: 0, dominio: 'x' } };
  const ids = L.pickGames(cfg, 2, ['a']);
  assert.deepEqual(ids.slice().sort(), ['b', 'c']);
});
