// Interfaz: pantallas, voz (hablar y escuchar), teclado numérico, almacenamiento y envío a Drive.
const TAREAS = {};

const UI = (() => {
  const root = () => document.getElementById('app');
  const $ = s => root().querySelector(s);
  const now = () => performance.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function show(html) {
    root().innerHTML = html;
    window.scrollTo(0, 0);
  }

  // Pinta la pantalla y espera a que se pulse un elemento con data-v; devuelve su valor.
  function ask(html) {
    show(html);
    return new Promise(res => {
      root().querySelectorAll('[data-v]').forEach(el => { el.onclick = () => res(el.dataset.v); });
    });
  }

  const intro = (title, html, btn = 'Empezar') =>
    ask(`<h2>${title}</h2><div class="txt">${html}</div><button class="big" data-v="go">${btn}</button>`);

  const question = (q, opts) =>
    ask(`<h2>${q}</h2><div class="opts">${opts.map(([v, l]) => `<button class="big alt" data-v="${v}">${l}</button>`).join('')}</div>`);

  // Respuestas rápidas sin escuchadores sueltos: una sola promesa pendiente cada vez.
  function responder(el, getValue) {
    let pending = null;
    el.addEventListener('pointerdown', e => {
      const v = getValue(e);
      if (v == null || !pending) return;
      e.preventDefault();
      const p = pending;
      pending = null;
      p({ v, t: now() });
    });
    return {
      next(timeout = 0) {
        return new Promise(res => {
          pending = res;
          if (timeout) setTimeout(() => { if (pending === res) { pending = null; res(null); } }, timeout);
        });
      },
    };
  }

  // ---------- Voz ----------
  function say(text, rate = 0.9) {
    if (!('speechSynthesis' in window)) return Promise.resolve(false);
    return new Promise(res => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      u.rate = rate;
      const v = speechSynthesis.getVoices().find(x => /^es[-_]ES/i.test(x.lang));
      if (v) u.voice = v;
      const t = setTimeout(() => res(true), 2500 + text.length * 120);
      u.onend = u.onerror = () => { clearTimeout(t); res(true); };
      speechSynthesis.speak(u);
    });
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  // Android corta el reconocimiento tras cada silencio: se relanza solo hasta que se pide parar.
  function startListening(onText) {
    let finals = [];
    let current = [];
    let stopped = false;
    let rec;
    let resolveDone;
    const done = new Promise(r => { resolveDone = r; });
    const run = () => {
      rec = new SR();
      rec.lang = 'es-ES';
      rec.continuous = true;
      rec.interimResults = true;
      current = [];
      rec.onresult = e => {
        current = [];
        let interim = '';
        for (let i = 0; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) current.push(r[0].transcript); else interim += ' ' + r[0].transcript;
        }
        onText([...finals, ...current].join(' ') + interim);
      };
      rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') stopped = true; };
      rec.onend = () => {
        finals = finals.concat(current);
        current = [];
        if (stopped) resolveDone(finals.join(' ')); else setTimeout(run, 100);
      };
      try { rec.start(); } catch { setTimeout(run, 300); }
    };
    run();
    return {
      stop() {
        stopped = true;
        try { rec.stop(); } catch { /* ya parado */ }
        setTimeout(() => resolveDone(finals.concat(current).join(' ')), 1500);
        return done;
      },
    };
  }

  // Escucha durante "seconds" (o hasta pulsar "He terminado"). Sin micrófono, deja escribir.
  async function listenPhase(title, prompt, seconds, allowFinish = true) {
    const typed = !SR;
    show(`<h2>${title}</h2><p class="txt">${prompt}</p><div class="count" id="cd">${seconds} s</div>
      ${typed ? '<textarea id="ta" rows="6" placeholder="Escribe aquí, separadas por espacios"></textarea>'
              : '<div class="live" id="live">🎤 Escuchando…</div>'}
      ${allowFinish ? '<button class="big" id="fin">He terminado</button>' : ''}`);
    const listener = typed ? null : startListening(t => { $('#live').textContent = t; });
    const t0 = Date.now();
    await new Promise(res => {
      const iv = setInterval(() => {
        const left = seconds - Math.floor((Date.now() - t0) / 1000);
        $('#cd').textContent = Math.max(0, left) + ' s';
        if (left <= 0) { clearInterval(iv); res(); }
      }, 250);
      if (allowFinish) $('#fin').onclick = () => { clearInterval(iv); res(); };
    });
    if (typed) return $('#ta').value;
    $('#cd').textContent = 'Procesando…';
    return listener.stop();
  }

  // Muestra lo reconocido para tachar errores del reconocedor o añadir palabras que no entendió.
  function reviewWords(title, words, hint) {
    let list = [...new Set(words)].map(w => ({ w, on: true }));
    return new Promise(res => {
      const draw = () => {
        show(`<h2>${title}</h2><p class="small">${hint}</p>
          <div class="chips">${list.map((x, i) => `<button class="chip ${x.on ? '' : 'off'}" data-i="${i}">${esc(x.w)}</button>`).join('') || '<em>(no se reconoció nada)</em>'}</div>
          <div class="row"><input id="add" placeholder="Añadir palabra" autocomplete="off"><button id="addb">Añadir</button></div>
          <button class="big" id="ok">Continuar</button>`);
        root().querySelectorAll('.chip').forEach(b => {
          b.onclick = () => {
            const i = +b.dataset.i;
            list = list.map((x, j) => (j === i ? { ...x, on: !x.on } : x));
            b.classList.toggle('off');
          };
        });
        const add = () => {
          const extra = Logic.toWords($('#add').value).filter(w => !list.some(x => x.w === w));
          if (extra.length) { list = list.concat(extra.map(w => ({ w, on: true }))); draw(); }
        };
        $('#addb').onclick = add;
        $('#add').onkeydown = e => { if (e.key === 'Enter') add(); };
        $('#ok').onclick = () => res(list.filter(x => x.on).map(x => x.w));
      };
      draw();
    });
  }

  // Teclado numérico. Devuelve el texto tecleado, o null si se acaba el tiempo sin respuesta.
  function keypad(top, maxLen = 12, timeLimitMs = 0) {
    let val = '';
    show(`${top}<div class="display" id="disp">&nbsp;</div>
      <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
      <button data-k="del">⌫</button><button data-k="0">0</button><button data-k="ok" class="ok">OK</button></div>`);
    return new Promise(res => {
      const to = timeLimitMs ? setTimeout(() => res(val || null), timeLimitMs) : null;
      root().querySelectorAll('[data-k]').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (k === 'ok') { if (val) { clearTimeout(to); res(val); } return; }
          val = k === 'del' ? val.slice(0, -1) : val.length < maxLen ? val + k : val;
          $('#disp').innerHTML = val || '&nbsp;';
        };
      });
    });
  }

  // ---------- Pantalla encendida durante las sesiones ----------
  let lock = null;
  const relock = async () => {
    try { if (document.visibilityState === 'visible' && lock !== null) lock = await navigator.wakeLock.request('screen'); } catch { /* sin soporte */ }
  };
  async function keepAwake(on) {
    try {
      if (on) { lock = 'pending'; await relock(); document.addEventListener('visibilitychange', relock); }
      else { document.removeEventListener('visibilitychange', relock); if (lock && lock.release) await lock.release(); lock = null; }
    } catch { /* sin soporte: no pasa nada */ }
  }

  return {
    $, now, sleep, esc, show, ask, intro, question, responder, say, listenPhase, reviewWords, keypad, keepAwake,
    hasMic: !!SR,
  };
})();

// ---------- Almacenamiento local ----------
const DB = (() => {
  const KEY = 'cerebro.v1';
  const EMPTY = { sesiones: [], niveles: {}, enviadas: [], evalEnCurso: null, planAplicado: null };
  const load = () => {
    try { return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...EMPTY }; }
  };
  const update = fn => {
    const next = fn(load());
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  };
  const saveSession = ses => update(d => ({ ...d, sesiones: d.sesiones.filter(s => s.id !== ses.id).concat(ses) }));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  return { load, update, saveSession };
})();

// ---------- Envío a Google Drive (menú Compartir de Android) ----------
// Android solo deja compartir ciertos tipos de archivo: el JSON va dentro de un .txt.
const Envio = (() => {
  const fileName = s => `cerebro_${s.id}_${s.tipo}.txt`;
  const toFile = (name, data) => new File([JSON.stringify(data, null, 2)], name, { type: 'text/plain' });
  const marca = s => s.id + '@' + (s.fin || '');

  async function share(files) {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: 'Resultados Cerebro' });
      return;
    }
    files.forEach(f => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      a.click();
    });
  }

  const pendientes = () => {
    const d = DB.load();
    return d.sesiones.filter(s => s.fin && !d.enviadas.includes(marca(s)));
  };

  // Devuelve true si se envió; false si el usuario canceló.
  async function enviarPendientes() {
    const ses = pendientes();
    if (!ses.length) return true;
    try {
      await share(ses.map(s => toFile(fileName(s), { app: 'cerebro', formato: 1, sesion: s })));
    } catch (e) {
      if (e.name === 'AbortError') return false;
      throw e;
    }
    DB.update(d => ({ ...d, enviadas: d.enviadas.concat(ses.map(marca)) }));
    return true;
  }

  async function exportarTodo() {
    const d = DB.load();
    const name = `cerebro_copia_completa_${new Date().toISOString().slice(0, 10)}.txt`;
    try {
      await share([toFile(name, { app: 'cerebro', formato: 1, copia: { sesiones: d.sesiones, niveles: d.niveles } })]);
    } catch (e) {
      if (e.name !== 'AbortError') throw e;
    }
  }

  return { pendientes, enviarPendientes, exportarTodo };
})();
