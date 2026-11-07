// Funciones ejecutivas: trazos A y B, Stroop y Torre de Londres (planificación).
(() => {
  const { shuffle, pick, median, mean, round, clamp, TOL_CAPS, tolKey, tolMove, tolProblem } = Logic;
  const { $, now, sleep, show, intro, responder } = UI;

  // ---------- Trazos ----------
  const LETRAS = 'ABCDEFGHIJKL';
  const etiquetas = (n, alterno) => Array.from({ length: n }, (_, i) =>
    (alterno ? (i % 2 === 0 ? String(i / 2 + 1) : LETRAS[(i - 1) / 2]) : String(i + 1)));

  function colocar(n, w, h, d) {
    for (let minDist = d * 1.35; minDist >= d * 1.05; minDist -= 4) {
      const pts = [];
      for (let tries = 0; tries < 20000 && pts.length < n; tries++) {
        const p = { x: d / 2 + Math.random() * (w - d), y: d / 2 + Math.random() * (h - d) };
        if (pts.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= minDist)) pts.push(p);
      }
      if (pts.length === n) return pts;
    }
    return null;
  }

  async function trazos(labels) {
    show(`<p class="small center">Toca en orden: ${labels.slice(0, 4).join(' → ')} → …</p><div class="board" id="b"><svg id="lines"></svg></div>`);
    const b = $('#b');
    const { width: w, height: h } = b.getBoundingClientRect();
    const D = 46;
    const pts = colocar(labels.length, w, h, D);
    if (!pts) throw new Error('Pantalla demasiado pequeña para los trazos');
    b.insertAdjacentHTML('beforeend', pts.map((p, i) =>
      `<button class="dot" data-i="${i}" style="left:${p.x - D / 2}px;top:${p.y - D / 2}px">${labels[i]}</button>`).join(''));
    let next = 0;
    let errores = 0;
    const t0 = now();
    await new Promise(res => {
      b.addEventListener('pointerdown', e => {
        const el = e.target.closest('.dot');
        if (!el) return;
        e.preventDefault();
        const i = +el.dataset.i;
        if (i === next) {
          el.classList.add('done');
          if (i > 0) {
            const a = pts[i - 1], c = pts[i];
            $('#lines').insertAdjacentHTML('beforeend', `<line x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"/>`);
          }
          next++;
          if (next === labels.length) res();
        } else if (i > next) {
          errores++;
          el.classList.add('bad');
          setTimeout(() => el.classList.remove('bad'), 350);
        }
      });
    });
    return { segundos: round((now() - t0) / 1000, 1), errores };
  }

  TAREAS.trazos = {
    nombre: 'Trazos',
    dominio: 'ejecutivas',
    async evaluacion() {
      await intro('Trazos A', '<p>Verás círculos con números del 1 al 25. <b>Tócalos en orden</b> (1, 2, 3…) lo más rápido que puedas.</p><p class="small">Si te equivocas, el círculo se pondrá rojo: busca el correcto y sigue.</p>');
      const a = await trazos(etiquetas(25, false));
      await intro('Trazos B', '<p>Ahora hay números y letras. <b>Alterna</b> entre ellos en orden: 1 → A → 2 → B → 3 → C…</p><p>Lo más rápido que puedas.</p>');
      const bRes = await trazos(etiquetas(25, true));
      return { segundosA: a.segundos, erroresA: a.errores, segundosB: bRes.segundos, erroresB: bRes.errores, ratioBA: round(bRes.segundos / a.segundos, 2) };
    },
    async entreno(nivel) {
      const n = Math.min(25, 8 + 2 * nivel);
      const objetivo = round(n * (2.6 - 0.1 * nivel), 0);
      await intro('Trazos alternos', `<p>Alterna números y letras: 1 → A → 2 → B…</p><p>${n} círculos. Reto: menos de <b>${objetivo} segundos</b>.</p>`);
      const r = await trazos(etiquetas(n, true));
      return { perf: clamp(objetivo / r.segundos - r.errores * 0.05, 0, 1), metricas: { ...r, circulos: n, objetivo } };
    },
  };

  // ---------- Stroop ----------
  const COLORES = [
    { n: 'ROJO', c: '#d62828' }, { n: 'VERDE', c: '#2a9d3a' },
    { n: 'AZUL', c: '#1f5fd1' }, { n: 'AMARILLO', c: '#e0a800' },
  ];

  function ensayosStroop(nNeutro, nCong, nIncong) {
    const t = [];
    for (let i = 0; i < nNeutro; i++) t.push({ palabra: 'XXXX', tinta: i % 4, tipo: 'neutro' });
    for (let i = 0; i < nCong; i++) t.push({ palabra: COLORES[i % 4].n, tinta: i % 4, tipo: 'congruente' });
    for (let i = 0; i < nIncong; i++) {
      const tinta = i % 4;
      t.push({ palabra: COLORES[pick([0, 1, 2, 3].filter(k => k !== tinta))].n, tinta, tipo: 'incongruente' });
    }
    return shuffle(t);
  }

  async function bloqueStroop(ensayos, limite) {
    show(`<div class="stage"><div class="stim" id="s"></div></div>
      <div class="grid2" id="g">${COLORES.map((c, i) => `<button data-c="${i}">${c.n.toLowerCase()}</button>`).join('')}</div>`);
    const resp = responder($('#g'), e => { const b = e.target.closest('[data-c]'); return b ? +b.dataset.c : null; });
    const s = $('#s');
    const out = [];
    for (const t of ensayos) {
      s.style.color = '#888';
      s.textContent = '+';
      await sleep(400);
      const p = resp.next(limite);
      s.textContent = t.palabra;
      s.style.color = COLORES[t.tinta].c;
      const t0 = now();
      const r = await p;
      out.push({ tipo: t.tipo, ok: !!r && r.v === t.tinta, rt: r ? r.t - t0 : null });
      s.textContent = '';
      await sleep(150);
    }
    return out;
  }

  const resumenTipo = (res, tipo) => {
    const xs = res.filter(r => r.tipo === tipo);
    return { mediana: round(median(xs.filter(r => r.ok).map(r => r.rt))), errores: xs.filter(r => !r.ok).length, n: xs.length };
  };

  TAREAS.stroop = {
    nombre: 'Colores (Stroop)',
    dominio: 'ejecutivas',
    async evaluacion() {
      await intro('Colores', '<p>Aparecerán palabras escritas en color. <b>Pulsa el COLOR de la tinta</b>, no lo que pone la palabra.</p><p class="small">Ejemplo: si ves la palabra VERDE escrita en rojo, pulsa «rojo».</p><p>Rápido, pero sin fallar.</p>');
      const res = await bloqueStroop(ensayosStroop(20, 24, 24), 3000);
      const neutro = resumenTipo(res, 'neutro');
      const cong = resumenTipo(res, 'congruente');
      const incong = resumenTipo(res, 'incongruente');
      return {
        neutroMs: neutro.mediana, congruenteMs: cong.mediana, incongruenteMs: incong.mediana,
        interferenciaMs: incong.mediana != null && cong.mediana != null ? incong.mediana - cong.mediana : null,
        erroresNeutro: neutro.errores, erroresCongruente: cong.errores, erroresIncongruente: incong.errores,
      };
    },
    async entreno(nivel) {
      const limite = Math.max(700, 2000 - 130 * (nivel - 1));
      await intro('Colores', `<p>Pulsa el <b>color de la tinta</b>, no la palabra.</p><p>Tienes <b>${(limite / 1000).toFixed(1)} s</b> por palabra.</p>`);
      const res = await bloqueStroop(ensayosStroop(0, 10, 30), limite);
      const ok = res.filter(r => r.ok);
      return {
        perf: ok.length / res.length,
        metricas: { aciertos: ok.length, total: res.length, limiteMs: limite, incongruenteMs: resumenTipo(res, 'incongruente').mediana },
      };
    },
  };

  // ---------- Torre de Londres ----------
  const pinta = (s, id, sel) => `<div class="tol" ${id ? `id="${id}"` : ''}>${s.map((p, i) =>
    `<div class="peg ${sel === i ? 'sel' : ''}" data-p="${i}" style="--cap:${TOL_CAPS[i]}"><div class="pole"></div>${
      p.map(b => `<div class="ball b${b}"></div>`).join('')}</div>`).join('')}</div>`;

  function resolverTorre(prob, maxMov, titulo) {
    let s = prob.start;
    let sel = null;
    let movs = 0;
    let primerMov = null;
    const t0 = now();
    return new Promise(res => {
      const fin = ok => res({ ok, movs, min: prob.min, planSeg: round(((primerMov ?? now()) - t0) / 1000, 1), totalSeg: round((now() - t0) / 1000, 1) });
      const draw = () => {
        show(`<p class="small center">${titulo}</p><p class="small center">Objetivo — en <b>${prob.min}</b> movimientos</p>
          <div class="goal">${pinta(prob.goal)}</div>${pinta(s, 'tol', sel)}
          <p class="center">Movimientos: <b>${movs}</b> / máx. ${maxMov}</p>`);
        $('#tol').querySelectorAll('.peg').forEach(el => { el.onclick = () => tap(+el.dataset.p); });
      };
      const tap = i => {
        if (sel === null) { if (s[i].length) sel = i; }
        else if (sel === i) sel = null;
        else {
          const n = tolMove(s, sel, i);
          if (!n) { sel = s[i].length ? i : sel; draw(); return; }
          s = n;
          movs++;
          primerMov ??= now();
          sel = null;
          if (tolKey(s) === tolKey(prob.goal)) { fin(true); return; }
          if (movs >= maxMov) { fin(false); return; }
        }
        draw();
      };
      draw();
    });
  }

  async function serieTorre(minimos) {
    const res = [];
    for (const [k, m] of minimos.entries()) {
      const prob = tolProblem(m);
      const r = await resolverTorre(prob, prob.min + Math.max(4, prob.min), `Problema ${k + 1} de ${minimos.length}`);
      res.push(r);
      show(`<div class="stage"><div class="stim small-stim">${r.ok ? (r.movs === r.min ? '¡Perfecto!' : `Resuelto en ${r.movs}`) : 'Sin resolver'}</div></div>`);
      await sleep(900);
    }
    return res;
  }

  const introTorre = '<p>Tienes 3 varillas: caben 3, 2 y 1 bolas. Mueve las bolas de abajo para que queden <b>igual que el objetivo</b> de arriba.</p><p>Toca una varilla para coger su bola de arriba y otra varilla para dejarla.</p><p><b>Piensa antes de mover</b>: intenta hacerlo con el mínimo de movimientos.</p>';

  TAREAS.torre = {
    nombre: 'Torre de Londres',
    dominio: 'ejecutivas',
    async evaluacion() {
      await intro('Planificación', introTorre);
      const res = await serieTorre([2, 3, 3, 4, 4, 5, 5, 6]);
      const ok = res.filter(r => r.ok);
      return {
        resueltosEnMinimo: res.filter(r => r.ok && r.movs === r.min).length,
        resueltos: ok.length,
        total: res.length,
        movimientosExtra: ok.reduce((s, r) => s + r.movs - r.min, 0),
        planificacionMediaSeg: round(mean(res.map(r => r.planSeg)), 1),
        tiempoTotalSeg: round(res.reduce((s, r) => s + r.totalSeg, 0)),
        detalle: res,
      };
    },
    async entreno(nivel) {
      const m = Math.min(8, 2 + Math.ceil(nivel * 0.6));
      await intro('Planificación', `${introTorre}<p>5 problemas de <b>${m} movimientos</b>.</p>`);
      const res = await serieTorre(Array(5).fill(m));
      const perfectos = res.filter(r => r.ok && r.movs === r.min).length;
      return { perf: perfectos / 5, metricas: { movimientos: m, perfectos, resueltos: res.filter(r => r.ok).length, planificacionMediaSeg: round(mean(res.map(r => r.planSeg)), 1) } };
    },
  };
})();
