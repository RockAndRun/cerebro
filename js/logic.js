// Lógica pura (sin DOM): la usan el navegador y los tests de Node.
(function (g) {
  'use strict';

  const rand = (rnd, n) => Math.floor(rnd() * n);
  const pick = (arr, rnd = Math.random) => arr[rand(rnd, arr.length)];
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const shuffle = (arr, rnd = Math.random) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(rnd, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------- Estadística ----------
  const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const sd = xs => {
    if (xs.length < 2) return null;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  };
  const median = xs => {
    if (!xs.length) return null;
    const a = xs.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

  // Inversa de la normal (Acklam), para d'.
  function probit(p) {
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const lo = 0.02425;
    const tail = q => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    if (p < lo) return tail(Math.sqrt(-2 * Math.log(p)));
    if (p > 1 - lo) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // Corrección log-lineal para que 0 % o 100 % no den infinito.
  const dprime = (hits, misses, fas, crs) =>
    probit((hits + 0.5) / (hits + misses + 1)) - probit((fas + 0.5) / (fas + crs + 1));

  // ---------- Palabras ----------
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const toWords = text => norm(text || '').split(' ').filter(Boolean);
  const STOP = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u', 'de', 'del',
    'a', 'al', 'en', 'con', 'que', 'eh', 'em', 'mm', 'pues', 'bueno', 'vale', 'otro', 'otra', 'tambien',
    'mas', 'no', 'si', 'ya', 'es', 'por', 'para', 'ah', 'oh']);

  function lev(a, b) {
    const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = dp[j];
        dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return dp[b.length];
  }

  // Acepta plurales y un error de una letra en palabras largas (fallos del reconocedor de voz).
  const sameWord = (w, t) => w === t || w === t + 's' || w === t + 'es' || (t.length >= 5 && lev(w, t) <= 1);

  function matchRecall(spoken, list) {
    const targets = list.map(norm);
    const found = new Set();
    const intrusions = new Set();
    for (const w of spoken.map(norm).filter(w => w && !STOP.has(w))) {
      const i = targets.findIndex(t => sameWord(w, t));
      if (i >= 0) found.add(i); else intrusions.add(w);
    }
    return { correct: [...found].sort((x, y) => x - y).map(i => list[i]), intrusions: [...intrusions] };
  }

  // Palabras únicas válidas para fluidez verbal; "perro" y "perros" cuentan una vez.
  function fluencyCount(words, letter) {
    const l = letter ? norm(letter) : null;
    const seen = new Set();
    const valid = [];
    for (const w of words.map(norm)) {
      if (!w || STOP.has(w) || (l && !w.startsWith(l))) continue;
      const key = w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w;
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push(w);
    }
    return { valid, count: valid.length };
  }

  // ---------- Torre de Londres (3 varillas de capacidad 3, 2 y 1; 3 bolas) ----------
  const TOL_CAPS = [3, 2, 1];
  const tolKey = s => s.map(p => p.join('')).join('|');
  function tolMove(s, from, to) {
    if (from === to || !s[from].length || s[to].length >= TOL_CAPS[to]) return null;
    const n = s.map(p => p.slice());
    n[to].push(n[from].pop());
    return n;
  }
  function tolDistances(start) {
    const dist = new Map([[tolKey(start), { d: 0, s: start }]]);
    const queue = [start];
    while (queue.length) {
      const s = queue.shift();
      const d = dist.get(tolKey(s)).d;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const n = tolMove(s, i, j);
        if (n && !dist.has(tolKey(n))) { dist.set(tolKey(n), { d: d + 1, s: n }); queue.push(n); }
      }
    }
    return dist;
  }
  function tolRandomState(rnd) {
    const s = [[], [], []];
    for (const ball of shuffle(['R', 'V', 'A'], rnd)) {
      const free = [0, 1, 2].filter(i => s[i].length < TOL_CAPS[i]);
      s[pick(free, rnd)].push(ball);
    }
    return s;
  }
  function tolProblem(moves, rnd = Math.random) {
    let best = null;
    for (let tries = 0; tries < 30; tries++) {
      const start = tolRandomState(rnd);
      const all = [...tolDistances(start).values()];
      const want = Math.min(moves, Math.max(...all.map(x => x.d)));
      if (!best || want > best.min) best = { start, goal: pick(all.filter(x => x.d === want), rnd).s, min: want };
      if (want === moves) break;
    }
    return best;
  }

  // ---------- Series numéricas (dificultad 1-8) ----------
  function genSeries(diff, rnd = Math.random) {
    const r = (a, b) => a + rand(rnd, b - a + 1);
    const idx = n => Array.from({ length: n }, (_, i) => i);
    let seq;
    switch (clamp(Math.round(diff), 1, 8)) {
      case 1: { const a = r(1, 20), k = r(2, 9); seq = idx(6).map(i => a + k * i); break; }
      case 2: {
        if (rnd() < 0.5) { const k = r(3, 9), a = r(6 * k, 6 * k + 30); seq = idx(6).map(i => a - k * i); }
        else { const a = r(1, 4), m = r(2, 3); seq = idx(6).map(i => a * m ** i); }
        break;
      }
      case 3: { const a = r(1, 15), d = r(1, 5), s = r(1, 3); seq = [a]; for (let i = 0; i < 5; i++) seq.push(seq[i] + d + s * i); break; }
      case 4: { const p = r(4, 9), q = r(1, p - 2), a = r(5, 20); seq = [a]; for (let i = 0; i < 5; i++) seq.push(seq[i] + (i % 2 ? -q : p)); break; }
      case 5: {
        const a = r(1, 10), k = r(2, 6), b = r(40, 60), m = r(2, 5);
        seq = idx(7).map(i => (i % 2 === 0 ? a + k * (i / 2) : b - m * ((i - 1) / 2)));
        break;
      }
      case 6: { const a = r(1, 5), b = r(a, a + 5); seq = [a, b]; while (seq.length < 7) seq.push(seq.at(-1) + seq.at(-2)); break; }
      case 7: { const a = r(2, 10), d = r(1, 3); seq = [a]; for (let i = 0; i < 5; i++) seq.push(seq[i] + d * 2 ** i); break; }
      default: {
        if (rnd() < 0.5) { const o = r(1, 4), c = r(0, 5); seq = idx(6).map(i => (i + o) ** 2 + c); }
        else { const c = r(1, 3), a = r(c + 1, c + 5); seq = [a]; for (let i = 0; i < 5; i++) seq.push(seq[i] * 2 - c); }
      }
    }
    return { shown: seq.slice(0, -1), answer: seq.at(-1) };
  }

  // ---------- N-back ----------
  function genNback(n, len, pTarget, letters, rnd = Math.random) {
    const seq = [];
    const isTarget = [];
    for (let i = 0; i < len; i++) {
      const t = i >= n && rnd() < pTarget;
      let l = t ? seq[i - n] : pick(letters, rnd);
      while (!t && i >= n && l === seq[i - n]) l = pick(letters, rnd);
      seq.push(l);
      isTarget.push(t);
    }
    return { seq, isTarget };
  }

  // ---------- Adaptación y selección de juegos ----------
  const NIVEL_MAX = 10;
  const nextLevel = (level, perf) => (perf >= 0.8 ? Math.min(NIVEL_MAX, level + 1) : perf < 0.5 ? Math.max(1, level - 1) : level);

  // Elige n juegos ponderados por peso, de dominios distintos y evitando repetir los de la última sesión.
  function pickGames(cfg, n, recent = [], rnd = Math.random) {
    let pool = Object.entries(cfg).filter(([, c]) => c.peso > 0).map(([id, c]) => ({ id, ...c }));
    const chosen = [];
    while (chosen.length < n && pool.length) {
      const used = new Set(chosen.map(c => c.dominio));
      let cands = pool.filter(c => !used.has(c.dominio));
      if (!cands.length) cands = pool;
      const fresh = cands.filter(c => !recent.includes(c.id));
      if (fresh.length) cands = fresh;
      let x = rnd() * cands.reduce((s, c) => s + c.peso, 0);
      const c = cands.find(k => (x -= k.peso) < 0) || cands.at(-1);
      chosen.push(c);
      pool = pool.filter(p => p.id !== c.id);
    }
    return chosen.map(c => c.id);
  }

  const api = {
    pick, shuffle, clamp, mean, sd, median, round, probit, dprime,
    norm, toWords, lev, matchRecall, fluencyCount,
    TOL_CAPS, tolKey, tolMove, tolDistances, tolProblem,
    genSeries, genNback, nextLevel, pickGames, NIVEL_MAX,
  };
  g.Logic = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
