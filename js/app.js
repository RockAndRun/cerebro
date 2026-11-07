// Flujo de la app: inicio, cuestionario previo, evaluación, entrenamiento adaptativo, historial y envío a Drive.
(() => {
  const { ask, show, intro, question, esc, keepAwake } = UI;

  const ORDEN_EVAL = ['palabras', 'digitos', 'reaccion', 'simbolos', 'stroop', 'trazos', 'fluidez',
    'atencion', 'nback', 'torre', 'cambio', 'series', 'palabras-diferido'];

  const PLAN_DEFECTO = {
    version: 'defecto', juegosPorSesion: 4, juegosFinDeSemana: 5, diasEntreEvaluaciones: 120,
    juegos: {}, nivelForzado: {}, mensaje: '',
  };
  const NIVEL_INICIAL = 2;

  const sello = () => new Date().toISOString().slice(0, 16).replace(':', '-');
  const fecha = iso => new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const esFinde = () => [0, 6].includes(new Date().getDay());
  const hoy = () => new Date().toDateString();

  // plan.json lo edita Claude tras revisar los resultados. Se valida por si llega roto.
  async function cargarPlan() {
    try {
      const r = await fetch('plan.json', { cache: 'no-store' });
      if (!r.ok) return PLAN_DEFECTO;
      const p = await r.json();
      return {
        ...PLAN_DEFECTO,
        ...p,
        juegos: typeof p.juegos === 'object' && p.juegos ? p.juegos : {},
        nivelForzado: typeof p.nivelForzado === 'object' && p.nivelForzado ? p.nivelForzado : {},
      };
    } catch {
      return PLAN_DEFECTO;
    }
  }

  function aplicarNivelesForzados(plan) {
    const d = DB.load();
    if (d.planAplicado === plan.version) return;
    const forzados = Object.fromEntries(Object.entries(plan.nivelForzado)
      .filter(([id, n]) => TAREAS[id] && Number.isInteger(n) && n >= 1 && n <= Logic.NIVEL_MAX));
    DB.update(x => ({ ...x, niveles: { ...x.niveles, ...forzados }, planAplicado: plan.version }));
  }

  async function checkIn() {
    const anti = await question('¿Has tomado hoy desloratadina u otro antihistamínico?', [['si', 'Sí'], ['no', 'No']]);
    const alcohol = await question('¿Has tomado alcohol en las últimas 6 horas?', [['si', 'Sí'], ['no', 'No']]);
    const cansancio = await question('¿Cómo de cansado te sientes ahora?',
      [['1', '1 · Nada'], ['2', '2 · Poco'], ['3', '3 · Normal'], ['4', '4 · Bastante'], ['5', '5 · Mucho']]);
    const entorno = await question('¿Dónde estás?', [['tranquilo', 'En un sitio tranquilo'], ['distracciones', 'Con ruido o distracciones']]);
    return { antihistaminico: anti === 'si', alcohol: alcohol === 'si', cansancio: +cansancio, entorno, hora: new Date().toTimeString().slice(0, 5) };
  }

  async function correr(fn) {
    try {
      return await fn();
    } catch (e) {
      console.error(e);
      await intro('Algo ha fallado', `<p>Esta prueba no se pudo completar y se ha anotado el fallo.</p><p class="small">${esc(e.message || e)}</p>`, 'Seguir');
      return { error: String(e.message || e) };
    }
  }

  // ---------- Evaluación ----------
  async function evaluacion() {
    let st = DB.load().evalEnCurso;
    if (!st) {
      await intro('Evaluación', `<p>Son <b>13 pruebas</b> y se tarda unos <b>40 minutos</b>.</p>
        <ul><li>Busca un sitio tranquilo, sin interrupciones.</li><li>Ponte las gafas y sube el volumen.</li>
        <li>La app te pedirá permiso para usar el micrófono: acéptalo.</li>
        <li>Puedes pausar entre pruebas, pero intenta hacerla de una vez: la memoria de palabras se vuelve a preguntar al final.</li></ul>`);
      const checkin = await checkIn();
      const n = DB.load().sesiones.filter(s => s.tipo === 'evaluacion').length;
      st = { id: sello(), tipo: 'evaluacion', inicio: new Date().toISOString(), checkin, lista: 'ABC'[n % 3], resultados: {} };
      DB.update(d => ({ ...d, evalEnCurso: st }));
    }
    await keepAwake(true);
    const ids = ORDEN_EVAL.filter(id => TAREAS[id]);
    for (const [i, id] of ids.entries()) {
      if (st.resultados[id]) continue;
      const v = await ask(`<p class="small">Prueba ${i + 1} de ${ids.length}</p><h2>${TAREAS[id].nombre}</h2>
        <button class="big" data-v="go">Continuar</button><button class="big alt" data-v="pausa">Pausar y salir</button>`);
      if (v === 'pausa') { await keepAwake(false); return inicio(); }
      const metricas = await correr(() => TAREAS[id].evaluacion(st));
      st = { ...st, resultados: { ...st.resultados, [id]: metricas } };
      DB.update(d => ({ ...d, evalEnCurso: st }));
    }
    const ses = { ...st, fin: new Date().toISOString() };
    DB.update(d => ({ ...d, evalEnCurso: null }));
    DB.saveSession(ses);
    await keepAwake(false);
    return final(ses, '<p>¡Evaluación completada! Envíame los resultados y los analizaré con calma.</p>');
  }

  // ---------- Entrenamiento ----------
  async function entreno() {
    const plan = await cargarPlan();
    aplicarNivelesForzados(plan);
    const checkin = await checkIn();
    const d = DB.load();
    const ultima = d.sesiones.filter(s => s.tipo === 'entreno').at(-1);
    const cfg = Object.fromEntries(Object.entries(TAREAS).filter(([, t]) => t.entreno)
      .map(([id, t]) => [id, { dominio: t.dominio, peso: plan.juegos[id]?.peso ?? 1 }]));
    const n = esFinde() ? plan.juegosFinDeSemana : plan.juegosPorSesion;
    const ids = Logic.pickGames(cfg, n, ultima ? Object.keys(ultima.resultados) : []);

    let ses = { id: sello(), tipo: 'entreno', inicio: new Date().toISOString(), checkin, planVersion: plan.version, resultados: {} };
    await keepAwake(true);
    for (const [i, id] of ids.entries()) {
      const nivel = DB.load().niveles[id] ?? NIVEL_INICIAL;
      const v = await ask(`<p class="small">Juego ${i + 1} de ${ids.length}</p><h2>${TAREAS[id].nombre}</h2>
        <p>Nivel <b>${nivel}</b> de ${Logic.NIVEL_MAX}</p><button class="big" data-v="go">Jugar</button>
        <button class="big alt" data-v="fin">Terminar por hoy</button>`);
      if (v === 'fin') break;
      const r = await correr(() => TAREAS[id].entreno(nivel));
      const perf = r.error ? null : Logic.clamp(r.perf, 0, 1);
      const nuevo = perf === null ? nivel : Logic.nextLevel(nivel, perf);
      ses = { ...ses, resultados: { ...ses.resultados, [id]: { nivel, perf: Logic.round(perf, 2), nuevoNivel: nuevo, ...(r.metricas || r) } } };
      DB.update(x => ({ ...x, niveles: { ...x.niveles, [id]: nuevo } }));
      DB.saveSession(ses);
      if (nuevo !== nivel) await intro(nuevo > nivel ? '¡Subes de nivel!' : 'Ajustamos el nivel', `<p>${TAREAS[id].nombre}: nivel ${nivel} → <b>${nuevo}</b></p>`, 'Seguir');
    }
    await keepAwake(false);
    const fin = { ...ses, fin: new Date().toISOString(), niveles: DB.load().niveles };
    DB.saveSession(fin);
    return final(fin, '<p>Sesión terminada. ¡Buen trabajo!</p>');
  }

  // ---------- Resultados ----------
  const pct = x => (x == null ? '—' : Math.round(x * 100) + ' %');
  function resumen(ses) {
    return Object.entries(ses.resultados).map(([id, r]) => {
      const nombre = TAREAS[id] ? TAREAS[id].nombre : id;
      if (r.error) return `<li>${nombre}: <em>no completada</em></li>`;
      return ses.tipo === 'entreno'
        ? `<li>${nombre}: ${pct(r.perf)} · nivel ${r.nivel}${r.nuevoNivel !== r.nivel ? ' → ' + r.nuevoNivel : ''}</li>`
        : `<li>${nombre}: hecha</li>`;
    }).join('');
  }

  async function enviar() {
    try {
      const ok = await Envio.enviarPendientes();
      await intro(ok ? 'Enviado' : 'No enviado', ok
        ? '<p>Resultados entregados. Comprueba que los guardaste en la carpeta <b>Cerebro-datos</b> de Drive.</p>'
        : '<p>Has cancelado el envío. Quedan pendientes y podrás enviarlos desde el inicio.</p>', 'Volver al inicio');
    } catch (e) {
      await intro('No se pudo enviar', `<p>${esc(e.message || e)}</p><p>Los resultados siguen guardados en el móvil.</p>`, 'Volver al inicio');
    }
    return inicio();
  }

  async function final(ses, msg) {
    const v = await ask(`<h2>Resumen</h2>${msg}<ul class="list">${resumen(ses)}</ul>
      <button class="big" data-v="drive">Guardar en Drive</button><button class="big alt" data-v="inicio">Ahora no</button>`);
    return v === 'drive' ? enviar() : inicio();
  }

  async function historial() {
    const d = DB.load();
    const items = d.sesiones.slice().reverse().slice(0, 30).map(s =>
      `<li><b>${fecha(s.inicio)}</b> · ${s.tipo === 'evaluacion' ? 'Evaluación' : 'Entreno'}${s.fin ? '' : ' (incompleta)'}<ul>${resumen(s)}</ul></li>`).join('');
    const niveles = Object.entries(d.niveles).map(([id, n]) => `<li>${TAREAS[id] ? TAREAS[id].nombre : id}: ${n}</li>`).join('');
    const v = await ask(`<h2>Historial</h2><h3>Niveles actuales</h3><ul class="list">${niveles || '<li>Aún ninguno</li>'}</ul>
      <h3>Sesiones</h3><ul class="list">${items || '<li>Aún no hay sesiones</li>'}</ul>
      <button class="big alt" data-v="todo">Exportar copia completa</button><button class="big" data-v="inicio">Volver</button>`);
    if (v === 'todo') await Envio.exportarTodo();
    return inicio();
  }

  // ---------- Inicio ----------
  async function inicio() {
    const plan = await cargarPlan();
    const d = DB.load();
    const evals = d.sesiones.filter(s => s.tipo === 'evaluacion');
    const ultimaEval = evals.at(-1);
    const diasEval = ultimaEval ? (Date.now() - new Date(ultimaEval.inicio)) / 86400000 : Infinity;
    const entrenoHoy = d.sesiones.some(s => s.tipo === 'entreno' && s.fin && new Date(s.inicio).toDateString() === hoy());
    const semana = d.sesiones.filter(s => s.tipo === 'entreno' && s.fin && Date.now() - new Date(s.inicio) < 7 * 86400000).length;
    const pend = Envio.pendientes().length;

    const botonEval = d.evalEnCurso
      ? '<button class="big" data-v="eval">Continuar la evaluación</button>'
      : !ultimaEval ? '<button class="big" data-v="eval">Evaluación inicial (≈40 min)</button>'
      : diasEval >= plan.diasEntreEvaluaciones ? '<button class="big" data-v="eval">Toca nueva evaluación (≈40 min)</button>'
      : '';
    const v = await ask(`<h1>Cerebro</h1>
      ${plan.mensaje ? `<div class="note">💬 ${esc(plan.mensaje)}</div>` : ''}
      <p class="small">${semana} sesiones en los últimos 7 días${entrenoHoy ? ' · <b>hoy ya has entrenado ✔</b>' : ''}</p>
      ${botonEval}
      <button class="big ${ultimaEval || d.evalEnCurso ? '' : 'alt'}" data-v="entreno">Entrenamiento de hoy (≈15 min)</button>
      ${pend ? `<button class="big warn" data-v="drive">Guardar en Drive (${pend} pendiente${pend > 1 ? 's' : ''})</button>` : ''}
      <button class="big alt" data-v="hist">Historial</button>
      ${ultimaEval && !botonEval ? '<button class="link" data-v="eval">Hacer una evaluación ahora</button>' : ''}
      ${UI.hasMic ? '' : '<p class="small warn-text">Este navegador no permite reconocer voz: en las pruebas habladas tendrás que escribir. Usa Chrome en Android.</p>'}`);
    if (v === 'eval') return evaluacion();
    if (v === 'entreno') return entreno();
    if (v === 'drive') return enviar();
    if (v === 'hist') return historial();
    return inicio();
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
  inicio();
})();
