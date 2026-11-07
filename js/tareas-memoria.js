// Memoria y atención: lista de palabras (inmediata y diferida), dígitos y atención sostenida (SART).
(() => {
  const { shuffle, matchRecall, toWords, mean, sd, round } = Logic;
  const { $, now, sleep, show, intro, question, responder, say, listenPhase, reviewWords, keypad } = UI;

  // Tres listas equivalentes para que las evaluaciones repetidas no se aprendan de memoria.
  const LISTAS = {
    A: ['botella', 'caballo', 'ventana', 'limón', 'martillo', 'nube', 'abrigo', 'tren', 'cuchara', 'río', 'guitarra', 'maleta'],
    B: ['tijeras', 'conejo', 'puerta', 'naranja', 'llave', 'montaña', 'camisa', 'barco', 'plato', 'lago', 'tambor', 'carta'],
    C: ['lápiz', 'oveja', 'escalera', 'cereza', 'tornillo', 'bosque', 'bufanda', 'avión', 'taza', 'playa', 'violín', 'sello'],
  };
  const BANCO = ['mesa', 'silla', 'perro', 'gato', 'zapato', 'reloj', 'libro', 'flor', 'árbol', 'piedra', 'coche', 'casa',
    'espejo', 'peine', 'manta', 'vaso', 'cuchillo', 'tenedor', 'sartén', 'olla', 'cama', 'almohada', 'lámpara', 'cuadro',
    'jarrón', 'sofá', 'alfombra', 'tejado', 'chimenea', 'balcón', 'farola', 'puente', 'castillo', 'iglesia', 'mercado',
    'hospital', 'colegio', 'estación', 'museo', 'teatro', 'fresa', 'melón', 'plátano', 'uva', 'pepino', 'tomate', 'patata',
    'ajo', 'pimiento', 'queso', 'pan', 'leche', 'huevo', 'miel', 'arroz', 'sal', 'león', 'elefante', 'jirafa', 'águila',
    'delfín', 'tortuga', 'serpiente', 'ratón', 'vaca', 'cerdo', 'pato', 'lobo', 'zorro', 'oso', 'trompeta', 'piano',
    'flauta', 'campana', 'pelota', 'cometa', 'muñeca', 'bicicleta', 'paraguas', 'sombrero', 'guante', 'cinturón', 'falda',
    'chaqueta', 'calcetín', 'botón', 'aguja', 'hilo', 'regla', 'cuaderno', 'mochila', 'periódico',
    'cartera', 'moneda', 'anillo', 'collar', 'pulsera', 'vela', 'cerilla', 'linterna', 'escoba', 'cubo', 'grifo', 'jabón',
    'toalla', 'cepillo', 'nevera', 'horno', 'tostadora', 'tetera', 'barril', 'cuerda', 'valla', 'pozo', 'molino',
    'granero', 'camión', 'autobús', 'cohete', 'submarino', 'velero', 'trineo', 'volcán', 'desierto', 'isla',
    'cueva', 'glaciar', 'pradera', 'selva', 'estrella', 'luna', 'trueno', 'arcoíris'];

  const recallHint = 'Toca las palabras que el móvil entendió mal para tacharlas. Si dijiste alguna que no aparece, añádela.';

  async function presentWords(words) {
    show('<div class="stage"><div class="stim" id="s"></div></div><p class="small center">Escucha y mira con atención</p>');
    await sleep(800);
    for (const w of words) {
      $('#s').textContent = w;
      await Promise.all([say(w), sleep(1300)]);
      $('#s').textContent = '';
      await sleep(400);
    }
  }

  async function recall(list, title, prompt) {
    const text = await listenPhase(title, prompt, 90);
    const words = await reviewWords('Revisa lo que dijiste', toWords(text), recallHint);
    return matchRecall(words, list);
  }

  // ---------- Lista de palabras ----------
  TAREAS.palabras = {
    nombre: 'Memoria de palabras',
    dominio: 'memoria',
    async evaluacion(ctx) {
      const list = LISTAS[ctx.lista];
      await intro('Memoria de palabras',
        '<p>Vas a oír y ver <b>12 palabras</b>. Al terminar, di en voz alta <b>todas las que recuerdes</b>, en cualquier orden.</p><p>Lo repetiremos <b>3 veces</b> con la misma lista. Intenta recordar cada vez más.</p><p class="small">Más tarde te volveré a preguntar por ellas.</p>');
      const ensayos = [];
      let intrusiones = [];
      for (let t = 1; t <= 3; t++) {
        await presentWords(list);
        const r = await recall(list, `Ensayo ${t} de 3`, 'Di todas las palabras que recuerdes. Pulsa «He terminado» cuando no recuerdes más.');
        ensayos.push(r.correct.length);
        intrusiones = intrusiones.concat(r.intrusions);
      }
      return { lista: ctx.lista, ensayos, total: ensayos.reduce((s, x) => s + x, 0), intrusiones, aprendidoEn: Date.now() };
    },
    async entreno(nivel) {
      const n = Math.min(16, 6 + nivel);
      const list = shuffle(BANCO).slice(0, n);
      await intro('Memoria de palabras', `<p>Oirás <b>${n} palabras</b> dos veces. Después de cada vez, dime todas las que recuerdes.</p><p class="small">Truco: crea una historia o imagen que las una.</p>`);
      const ensayos = [];
      for (let t = 1; t <= 2; t++) {
        await presentWords(list);
        const r = await recall(list, `Ensayo ${t} de 2`, 'Di todas las palabras que recuerdes.');
        ensayos.push(r.correct.length);
      }
      return { perf: ensayos[1] / n, metricas: { palabras: n, ensayos } };
    },
  };

  TAREAS['palabras-diferido'] = {
    nombre: 'Recuerdo diferido',
    dominio: 'memoria',
    async evaluacion(ctx) {
      const aprendizaje = ctx.resultados.palabras;
      if (!aprendizaje || aprendizaje.error) return { omitido: 'no se completó la prueba de aprendizaje' };
      const list = LISTAS[aprendizaje.lista];
      await intro('Recuerdo diferido', '<p>Al principio oíste una lista de 12 palabras tres veces.</p><p><b>Dime todas las que recuerdes ahora.</b></p>');
      const minutos = round((Date.now() - aprendizaje.aprendidoEn) / 60000, 1);
      const r = await recall(list, 'Recuerdo diferido', 'Di todas las palabras de aquella lista que recuerdes.');

      await intro('Reconocimiento', '<p>Ahora verás palabras de una en una. Indica si <b>estaban en la lista</b> o no.</p>');
      const otras = Object.entries(LISTAS).find(([k]) => k !== aprendizaje.lista)[1];
      const items = shuffle(list.map(w => ({ w, en: true })).concat(otras.map(w => ({ w, en: false }))));
      let aciertos = 0;
      let falsosReconocimientos = 0;
      for (const it of items) {
        const v = await question(`<span class="stim inline">${it.w}</span><br>¿Estaba en la lista?`, [['si', 'Sí'], ['no', 'No']]);
        if ((v === 'si') === it.en) aciertos++;
        if (v === 'si' && !it.en) falsosReconocimientos++;
      }
      return {
        minutosDesdeAprendizaje: minutos,
        recuerdoLibre: r.correct.length,
        intrusiones: r.intrusions,
        reconocimientoAciertos: aciertos,
        reconocimientoTotal: items.length,
        falsosReconocimientos,
      };
    },
  };

  // ---------- Dígitos ----------
  const randomDigits = n => {
    const d = [];
    while (d.length < n) {
      const x = 1 + Math.floor(Math.random() * 9);
      if (x !== d.at(-1)) d.push(x);
    }
    return d;
  };

  async function digitTrial(n, inversos) {
    const d = randomDigits(n);
    show('<div class="stage"><div class="stim" id="s"></div></div>');
    await sleep(700);
    for (const x of d) {
      $('#s').textContent = x;
      say(String(x), 1);
      await sleep(700);
      $('#s').textContent = '';
      await sleep(300);
    }
    const resp = await keypad(`<h2>${inversos ? 'Al revés' : 'En el mismo orden'}</h2><p class="small">Escribe los ${n} números ${inversos ? 'empezando por el último' : 'tal como aparecieron'}.</p>`, n + 2);
    const expected = (inversos ? d.slice().reverse() : d).join('');
    return resp === expected;
  }

  async function spanSeries(inversos, from, to) {
    let max = 0;
    let total = 0;
    for (let n = from; n <= to; n++) {
      let ok = 0;
      for (let t = 0; t < 2; t++) if (await digitTrial(n, inversos)) ok++;
      total += ok;
      if (!ok) break;
      max = n;
    }
    return { max, total };
  }

  TAREAS.digitos = {
    nombre: 'Dígitos',
    dominio: 'memoria',
    async evaluacion() {
      await intro('Dígitos en orden', '<p>Verás y oirás una serie de números, uno por segundo. Después, escríbelos <b>en el mismo orden</b>.</p><p>Las series se irán alargando.</p>');
      const directos = await spanSeries(false, 3, 9);
      await intro('Dígitos al revés', '<p>Ahora escribe los números <b>al revés</b>, del último al primero.</p><p class="small">Ejemplo: si ves 3 – 8 – 1, escribe 1 8 3.</p>');
      const inversos = await spanSeries(true, 2, 8);
      return { directosMax: directos.max, directosTotal: directos.total, inversosMax: inversos.max, inversosTotal: inversos.total };
    },
    async entreno(nivel) {
      const inversos = Math.random() < 0.5;
      const n = Math.min(12, (inversos ? 2 : 3) + nivel);
      await intro('Dígitos', `<p>Series de <b>${n} números</b>. Escríbelos ${inversos ? '<b>al revés</b> (del último al primero)' : '<b>en el mismo orden</b>'}.</p><p class="small">Truco: agrúpalos de dos en dos o de tres en tres.</p>`);
      let ok = 0;
      for (let t = 0; t < 5; t++) if (await digitTrial(n, inversos)) ok++;
      return { perf: ok / 5, metricas: { modo: inversos ? 'inversos' : 'directos', longitud: n, aciertos: ok, ensayos: 5 } };
    },
  };

  // ---------- Atención sostenida (toca todos los números menos el 3) ----------
  async function sart(perDigit, isi) {
    const seq = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(d => Array(perDigit).fill(d)));
    show('<div class="stage tap" id="st"><div class="stim" id="s"></div></div><p class="small center">Toca la zona gris con cada número… <b>excepto el 3</b></p>');
    const resp = responder($('#st'), () => 1);
    await sleep(1200);
    const res = [];
    for (const d of seq) {
      const p = resp.next(isi);
      const t0 = now();
      $('#s').textContent = d;
      await sleep(250);
      $('#s').textContent = '⊗';
      const r = await p;
      const left = isi - (now() - t0);
      if (left > 0) await sleep(left);
      res.push({ d, rt: r ? r.t - t0 : null });
    }
    const nogo = res.filter(x => x.d === 3);
    const go = res.filter(x => x.d !== 3);
    const rts = go.filter(x => x.rt !== null).map(x => x.rt);
    const comisiones = nogo.filter(x => x.rt !== null).length;
    const omisiones = go.length - rts.length;
    return {
      comisiones, totalNoGo: nogo.length, omisiones, totalGo: go.length,
      trMedio: round(mean(rts)), trDesviacion: round(sd(rts)),
      perf: Math.max(0, 1 - (comisiones / nogo.length) * 0.6 - (omisiones / go.length) * 0.4),
    };
  }

  TAREAS.atencion = {
    nombre: 'Atención sostenida',
    dominio: 'memoria',
    async evaluacion() {
      await intro('Atención sostenida', '<p>Irán apareciendo números del 1 al 9, muy rápido.</p><p><b>Toca la pantalla con cada número, EXCEPTO cuando salga el 3.</b></p><p>Importa tanto la rapidez como no fallar. Dura unos 3 minutos.</p>');
      const { perf, ...m } = await sart(15, 1150);
      return m;
    },
    async entreno(nivel) {
      const isi = Math.max(600, 1150 - 60 * (nivel - 1));
      await intro('Atención sostenida', `<p>Toca con cada número <b>excepto el 3</b>. Ritmo: un número cada ${(isi / 1000).toFixed(2)} s.</p>`);
      const { perf, ...m } = await sart(10, isi);
      return { perf, metricas: { ...m, intervaloMs: isi } };
    },
  };
})();
