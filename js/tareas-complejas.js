// Alta complejidad: n-back (memoria de trabajo), cambio de tarea (flexibilidad) y series (razonamiento).
(() => {
  const { pick, genNback, dprime, genSeries, median, round, clamp } = Logic;
  const { $, now, sleep, show, intro, responder, keypad } = UI;

  // ---------- N-back ----------
  const LETRAS_NB = ['B', 'F', 'K', 'M', 'P', 'R', 'S', 'T'];

  async function bloqueNback(n, len, isi) {
    const { seq, isTarget } = genNback(n, len, 0.3, LETRAS_NB);
    show(`<p class="center"><b>${n}-back</b>: pulsa si la letra es igual a la de hace ${n}</p>
      <div class="stage"><div class="stim" id="s"></div></div><button class="big" id="m">Coincide</button>`);
    const resp = responder($('#m'), () => 1);
    await sleep(1000);
    let aciertos = 0, omisiones = 0, falsasAlarmas = 0, rechazos = 0;
    for (let i = 0; i < len; i++) {
      const p = resp.next(isi);
      const t0 = now();
      $('#s').textContent = seq[i];
      setTimeout(() => { if ($('#s')) $('#s').textContent = ''; }, 500);
      const r = await p;
      if (r) $('#m').classList.add('pressed');
      const left = isi - (now() - t0);
      if (left > 0) await sleep(left);
      $('#m').classList.remove('pressed');
      if (isTarget[i]) { if (r) aciertos++; else omisiones++; } else if (r) falsasAlarmas++; else rechazos++;
    }
    return { n, aciertos, omisiones, falsasAlarmas, rechazos, dprime: round(dprime(aciertos, omisiones, falsasAlarmas, rechazos), 2) };
  }

  const tasa = (a, b) => (a + b ? a / (a + b) : 0);
  const introNback = n => `<p>Verás letras de una en una. Pulsa <b>«Coincide»</b> cuando la letra sea <b>igual a la que apareció ${n} posiciones antes</b>.</p>
    <p class="small">Ejemplo ${n}-back: ${n === 2 ? 'K – M – <b>K</b> (la K coincide con la de 2 atrás)' : 'K – M – R – <b>K</b> (la K coincide con la de 3 atrás)'}.</p>`;

  TAREAS.nback = {
    nombre: 'N-back',
    dominio: 'compleja',
    async evaluacion() {
      await intro('Memoria de trabajo (2-back)', introNback(2));
      const b2 = await bloqueNback(2, 30, 2500);
      await intro('Memoria de trabajo (3-back)', introNback(3) + '<p>Ahora es más difícil: no te preocupes si fallas.</p>');
      const b3 = await bloqueNback(3, 30, 2500);
      return { dosBack: b2, tresBack: b3 };
    },
    async entreno(nivel) {
      const n = nivel <= 3 ? 2 : nivel <= 6 ? 3 : 4;
      const isi = 2500 - 200 * ((nivel - 1) % 3);
      await intro(`N-back (${n} atrás)`, `${n <= 3 ? introNback(n) : '<p>Pulsa «Coincide» cuando la letra sea igual a la de <b>4 posiciones antes</b>.</p>'}<p>Dos rondas.</p>`);
      const rondas = [await bloqueNback(n, 20 + n, isi), await bloqueNback(n, 20 + n, isi)];
      const perf = rondas.reduce((s, r) => s + clamp(tasa(r.aciertos, r.omisiones) - tasa(r.falsasAlarmas, r.rechazos), 0, 1), 0) / 2;
      return { perf, metricas: { n, intervaloMs: isi, rondas } };
    },
  };

  // ---------- Cambio de tarea ----------
  const VOCALES = ['A', 'E', 'I', 'U'];
  const CONSONANTES = ['G', 'K', 'M', 'R'];
  const PARES = [2, 4, 6, 8];
  const IMPARES = [3, 5, 7, 9];

  async function bloqueCambio(n, limite, practica) {
    show(`<div class="switch"><div class="half" id="arriba"><span class="tag">LETRA</span></div><div class="half" id="abajo"><span class="tag">NÚMERO</span></div></div>
      <div class="grid2" id="g"><button data-r="0">Vocal<br><small>Par</small></button><button data-r="1">Consonante<br><small>Impar</small></button></div>`);
    const resp = responder($('#g'), e => { const b = e.target.closest('[data-r]'); return b ? +b.dataset.r : null; });
    const out = [];
    let prev = null;
    for (let i = 0; i < n; i++) {
      const pos = Math.random() < 0.5 ? 'arriba' : 'abajo';
      const vocal = Math.random() < 0.5;
      const par = Math.random() < 0.5;
      const estimulo = pick(vocal ? VOCALES : CONSONANTES) + pick(par ? PARES : IMPARES);
      const correcta = pos === 'arriba' ? (vocal ? 0 : 1) : (par ? 0 : 1);
      const cel = $('#' + pos);
      const p = resp.next(limite);
      cel.insertAdjacentHTML('beforeend', `<span class="stim" id="sw">${estimulo}</span>`);
      const t0 = now();
      const r = await p;
      $('#sw').remove();
      const ok = !!r && r.v === correcta;
      if (prev !== null) out.push({ cambio: pos !== prev, ok, rt: r ? r.t - t0 : null });
      prev = pos;
      if (practica && !ok) { cel.classList.add('bad'); await sleep(600); cel.classList.remove('bad'); }
      await sleep(300);
    }
    return out;
  }

  const resumenCambio = (res, cambio) => {
    const xs = res.filter(r => r.cambio === cambio);
    return { mediana: round(median(xs.filter(r => r.ok).map(r => r.rt))), errores: xs.filter(r => !r.ok).length };
  };
  const introCambio = '<p>Aparecerá una letra y un número (por ejemplo <b>K4</b>):</p><ul><li>Si sale <b>arriba</b>, fíjate en la <b>letra</b>: ¿vocal o consonante?</li><li>Si sale <b>abajo</b>, fíjate en el <b>número</b>: ¿par o impar?</li></ul><p>Botón izquierdo = vocal / par. Botón derecho = consonante / impar.</p>';

  TAREAS.cambio = {
    nombre: 'Cambio de tarea',
    dominio: 'compleja',
    async evaluacion() {
      await intro('Cambio de tarea', introCambio + '<p>Primero, 8 ensayos de práctica.</p>');
      await bloqueCambio(8, 5000, true);
      await intro('Cambio de tarea', '<p>Ahora va en serio: 48 ensayos. Rápido y sin fallar.</p>');
      const res = await bloqueCambio(48, 4000, false);
      const rep = resumenCambio(res, false);
      const cam = resumenCambio(res, true);
      return {
        repeticionMs: rep.mediana, cambioMs: cam.mediana,
        costeCambioMs: rep.mediana != null && cam.mediana != null ? cam.mediana - rep.mediana : null,
        erroresRepeticion: rep.errores, erroresCambio: cam.errores,
      };
    },
    async entreno(nivel) {
      const limite = Math.max(900, 2600 - 150 * (nivel - 1));
      await intro('Cambio de tarea', `${introCambio}<p>Tienes <b>${(limite / 1000).toFixed(1)} s</b> por ensayo.</p>`);
      const res = await bloqueCambio(41, limite, false);
      const ok = res.filter(r => r.ok).length;
      return { perf: ok / res.length, metricas: { aciertos: ok, total: res.length, limiteMs: limite, costeCambioMs: (resumenCambio(res, true).mediana ?? 0) - (resumenCambio(res, false).mediana ?? 0) } };
    },
  };

  // ---------- Series numéricas ----------
  async function serie(diff, limiteMs, k, total) {
    const s = genSeries(diff);
    const t0 = now();
    const r = await keypad(`<p class="small center">Serie ${k} de ${total} · máx. ${Math.round(limiteMs / 1000)} s</p>
      <h2 class="center">${s.shown.join(', ')}, ?</h2><p class="small center">¿Qué número sigue?</p>`, 5, limiteMs);
    return { dificultad: diff, ok: r !== null && +r === s.answer, seg: round((now() - t0) / 1000, 1) };
  }

  TAREAS.series = {
    nombre: 'Series lógicas',
    dominio: 'compleja',
    async evaluacion() {
      await intro('Series lógicas', '<p>Verás una serie de números que sigue una regla. <b>Escribe el número que sigue.</b></p><p>Las series se irán complicando. Tienes 60 segundos por serie; si no la ves, pon tu mejor intento.</p>');
      const difs = [1, 2, 3, 3, 4, 5, 5, 6, 7, 8];
      const res = [];
      for (const [i, d] of difs.entries()) res.push(await serie(d, 60000, i + 1, difs.length));
      return { correctas: res.filter(r => r.ok).length, total: res.length, detalle: res };
    },
    async entreno(nivel) {
      const tope = Math.min(8, nivel);
      const limite = nivel > 8 ? 60000 - 8000 * (nivel - 8) : 60000;
      await intro('Series lógicas', '<p>Encuentra la regla y escribe el número que sigue. 8 series.</p>');
      const res = [];
      for (let i = 0; i < 8; i++) res.push(await serie(Math.max(1, tope - 2 + Math.floor(Math.random() * 3)), limite, i + 1, 8));
      const ok = res.filter(r => r.ok).length;
      return { perf: ok / 8, metricas: { correctas: ok, total: 8, detalle: res } };
    },
  };
})();
