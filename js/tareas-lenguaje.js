// Lenguaje y velocidad de procesamiento: fluidez verbal (voz), símbolos-dígitos y tiempo de reacción.
(() => {
  const { shuffle, pick, toWords, fluencyCount, median, round } = Logic;
  const { $, now, sleep, show, intro, responder, listenPhase, reviewWords } = UI;

  // ---------- Fluidez verbal ----------
  const LETRAS = ['P', 'M', 'R', 'S', 'T', 'C', 'L', 'F', 'A', 'E', 'D', 'B'];
  const CATEGORIAS = ['animales', 'frutas y verduras', 'profesiones', 'prendas de ropa', 'objetos de una cocina',
    'países', 'instrumentos musicales', 'deportes', 'partes del cuerpo', 'herramientas', 'medios de transporte',
    'cosas que hay en un supermercado'];

  async function rondaFluidez({ letra, categoria }) {
    const consigna = letra
      ? `Di todas las palabras que puedas que empiecen por <b>${letra}</b>.`
      : `Di todos los <b>${categoria}</b> que se te ocurran.`;
    const reglas = letra
      ? '<p class="small">No valen nombres propios (personas, ciudades, marcas) ni la misma palabra con otra terminación (perro, perros, perrito).</p>'
      : '';
    await intro('Fluidez verbal', `<p>${consigna}</p>${reglas}<p>Tienes <b>60 segundos</b>. Habla claro, con una pequeña pausa entre palabras.</p>`);
    const text = await listenPhase('Fluidez verbal', consigna, 60, false);
    const words = await reviewWords('Revisa las palabras', toWords(text),
      'Tacha las que el móvil entendió mal o que no valen. Añade solo las que dijiste y no aparecen.');
    const r = fluencyCount(words, letra || null);
    return { estimulo: letra || categoria, correctas: r.count, palabras: r.valid };
  }

  TAREAS.fluidez = {
    nombre: 'Fluidez verbal',
    dominio: 'lenguaje',
    async evaluacion() {
      const fonemica = await rondaFluidez({ letra: 'P' });
      const semantica = await rondaFluidez({ categoria: 'animales' });
      return { letraP: fonemica.correctas, animales: semantica.correctas, palabrasP: fonemica.palabras, palabrasAnimales: semantica.palabras };
    },
    async entreno(nivel) {
      const r = await rondaFluidez(Math.random() < 0.5 ? { letra: pick(LETRAS.slice(1)) } : { categoria: pick(CATEGORIAS.slice(1)) });
      return { perf: Math.min(1, r.correctas / (12 + nivel)), metricas: r };
    },
  };

  // ---------- Símbolos y dígitos ----------
  const SIMBOLOS = ['◆', '▲', '●', '■', '★', '✚', '◐', '▼', '♠'];

  async function simbolosDigitos(segundos) {
    const clave = shuffle(SIMBOLOS);
    show(`<div class="key">${clave.map((s, i) => `<div><span>${s}</span><b>${i + 1}</b></div>`).join('')}</div>
      <div class="stage short"><div class="stim" id="s"></div></div><div class="count" id="t">${segundos} s</div>
      <div class="pad pad9" id="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}</div>`);
    let actual = -1;
    let correctas = 0;
    let errores = 0;
    const siguiente = () => {
      let n;
      do n = Math.floor(Math.random() * 9); while (n === actual);
      actual = n;
      $('#s').textContent = clave[n];
    };
    siguiente();
    const fin = now() + segundos * 1000;
    await new Promise(res => {
      $('#pad').addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-k]');
        if (!b || now() > fin) return;
        e.preventDefault();
        if (+b.dataset.k === actual + 1) correctas++; else errores++;
        siguiente();
      });
      const iv = setInterval(() => {
        const left = Math.ceil((fin - now()) / 1000);
        $('#t').textContent = Math.max(0, left) + ' s';
        if (left <= 0) { clearInterval(iv); res(); }
      }, 200);
    });
    return { correctas, errores, segundos };
  }

  TAREAS.simbolos = {
    nombre: 'Símbolos y números',
    dominio: 'lenguaje',
    async evaluacion() {
      await intro('Símbolos y números', '<p>Arriba tienes una clave: cada símbolo tiene un número.</p><p>Cuando aparezca un símbolo en el centro, <b>pulsa su número</b> lo más rápido que puedas sin equivocarte.</p><p>Dura 90 segundos.</p>');
      return simbolosDigitos(90);
    },
    async entreno(nivel) {
      const objetivo = 20 + 3 * nivel;
      await intro('Símbolos y números', `<p>Pulsa el número de cada símbolo según la clave. La clave cambia cada vez.</p><p>Reto: <b>${objetivo} aciertos</b> en 60 segundos.</p>`);
      const r = await simbolosDigitos(60);
      return { perf: Math.min(1, r.correctas / objetivo) - r.errores * 0.02, metricas: { ...r, objetivo } };
    },
  };

  // ---------- Tiempo de reacción (solo evaluación) ----------
  async function reaccionSimple(n) {
    show('<div class="stage tap" id="st"><div class="stim" id="s"></div></div><p class="small center">Toca en cuanto aparezca el círculo verde</p>');
    const resp = responder($('#st'), () => 1);
    const rts = [];
    let anticipaciones = 0;
    for (let i = 0; i < n; i++) {
      $('#s').innerHTML = '';
      const p = resp.next();
      const early = await Promise.race([p, sleep(1000 + Math.random() * 2000).then(() => null)]);
      if (early) { anticipaciones++; i--; $('#s').textContent = 'Demasiado pronto'; await sleep(800); continue; }
      $('#s').innerHTML = '<span class="dot-go"></span>';
      const t0 = now();
      const r = await p;
      rts.push(r.t - t0);
      $('#s').innerHTML = '';
      await sleep(300);
    }
    return { mediana: round(median(rts)), anticipaciones };
  }

  async function reaccionEleccion(n) {
    show('<div class="stage tap" id="st"><div class="stim" id="s"></div></div><p class="small center">Toca la mitad izquierda o derecha según la flecha</p>');
    const st = $('#st');
    const resp = responder(st, e => {
      const r = st.getBoundingClientRect();
      return e.clientX < r.left + r.width / 2 ? 'izq' : 'der';
    });
    const rts = [];
    let errores = 0;
    for (let i = 0; i < n; i++) {
      $('#s').textContent = '';
      await sleep(700 + Math.random() * 1200);
      const lado = Math.random() < 0.5 ? 'izq' : 'der';
      const p = resp.next(3000);
      $('#s').textContent = lado === 'izq' ? '◀' : '▶';
      const t0 = now();
      const r = await p;
      if (r && r.v === lado) rts.push(r.t - t0); else errores++;
    }
    return { mediana: round(median(rts)), errores };
  }

  TAREAS.reaccion = {
    nombre: 'Tiempo de reacción',
    dominio: 'lenguaje',
    async evaluacion() {
      await intro('Tiempo de reacción', '<p>Primera parte: toca la zona gris <b>en cuanto aparezca un círculo verde</b>. No te adelantes.</p>');
      const simple = await reaccionSimple(15);
      await intro('Tiempo de reacción', '<p>Segunda parte: aparecerá una flecha. Toca la <b>mitad izquierda</b> si apunta a la izquierda (◀) y la <b>derecha</b> si apunta a la derecha (▶).</p>');
      const eleccion = await reaccionEleccion(20);
      return { simpleMedianaMs: simple.mediana, anticipaciones: simple.anticipaciones, eleccionMedianaMs: eleccion.mediana, eleccionErrores: eleccion.errores };
    },
  };
})();
