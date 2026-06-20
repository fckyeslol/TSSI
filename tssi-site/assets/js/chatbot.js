/* TSSI — widget de asistente con IA (RAG, streaming SSE) */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const fab = $('#chatFab'), panel = $('#chatPanel'), body = $('#chatBody');
  const input = $('#chatInput'), send = $('#chatSend'), suggestBox = $('#chatSuggest');
  let history = [], busy = false, greeted = false;

  const SUGGESTIONS = [
    '¿Qué cubre el seguro de mascotas?',
    'Compara los planes de salud',
    'RC para empresas',
    '¿Cómo afilio mi empresa a la ARL?',
  ];

  const TOOL_LABEL = {
    buscar_seguros: 'Buscando en el catálogo',
    detalle_producto: 'Consultando detalle del producto',
    comparar_productos: 'Comparando productos',
  };

  function open() {
    panel.classList.add('open'); fab.style.display = 'none';
    if (!greeted) { greeted = true; greet(); }
    setTimeout(() => input.focus(), 300);
  }
  function close() { panel.classList.remove('open'); fab.style.display = 'grid'; }
  fab.addEventListener('click', open);
  $('#chatX').addEventListener('click', close);

  function greet() {
    addBot('Bienvenido a **TSSI**. Soy tu asistente. Pregúntame sobre coberturas, exclusiones, planes o trámites de ARL y te respondo al instante.');
    renderSuggestions();
  }

  function renderSuggestions() {
    suggestBox.innerHTML = SUGGESTIONS.map(s => `<button>${s}</button>`).join('');
    suggestBox.querySelectorAll('button').forEach(b => b.addEventListener('click', () => askInternal(b.textContent)));
  }

  // mini markdown -> html
  function md(t) {
    return t
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">enlace</a>')
      .replace(/^\s*[-*]\s+(.+)$/gm, '• $1')
      .replace(/\n/g, '<br>');
  }

  function addBot(text) {
    const el = document.createElement('div'); el.className = 'msg bot'; el.innerHTML = md(text);
    body.appendChild(el); scroll(); return el;
  }
  function addUser(text) {
    const el = document.createElement('div'); el.className = 'msg user'; el.textContent = text;
    body.appendChild(el); scroll();
  }
  function addTool(tool) {
    const el = document.createElement('div'); el.className = 'msg-tool';
    el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg> ${TOOL_LABEL[tool] || 'Consultando'}…`;
    body.appendChild(el); scroll(); return el;
  }
  function typing() {
    const el = document.createElement('div'); el.className = 'msg bot'; el.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    body.appendChild(el); scroll(); return el;
  }
  const scroll = () => { body.scrollTop = body.scrollHeight; };

  async function askInternal(text) {
    if (busy || !text.trim()) return;
    busy = true; suggestBox.innerHTML = '';
    addUser(text);
    const think = typing();
    let botEl = null, acc = '', srcs = [];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      });
      if (!res.ok || !res.body) throw new Error('sin respuesta');
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop();
        for (const p of parts) {
          const line = p.trim(); if (!line.startsWith('data:')) continue;
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === 'meta') {
            think.remove();
            addTool(ev.tool);
            srcs = ev.sources || [];
            botEl = addBot('');
          } else if (ev.type === 'token') {
            if (!botEl) { think.remove(); botEl = addBot(''); }
            acc += ev.text; botEl.innerHTML = md(acc); scroll();
          } else if (ev.type === 'error') {
            think.remove(); addBot('Lo siento, hubo un problema. Intenta de nuevo o déjanos tus datos en el formulario de contacto.');
          }
        }
      }
      if (botEl && srcs.length) {
        const s = document.createElement('div'); s.className = 'chat-srcs';
        s.innerHTML = srcs.slice(0, 4).map(x => `<a href="${x.url}" target="_blank" rel="noopener">${(x.nombre || 'Fuente').slice(0, 28)}</a>`).join('');
        botEl.appendChild(s);
      }
      if (acc) history.push({ role: 'user', content: text }, { role: 'assistant', content: acc });
      // CTA de captura tras 2 intercambios
      if (history.length >= 4 && !document.querySelector('.chat-lead')) leadNudge();
    } catch (e) {
      think.remove();
      addBot('No pude conectar con el asistente. Asegúrate de que el servidor esté corriendo, o déjanos tus datos en **Contacto** y te ayudamos.');
    } finally { busy = false; scroll(); }
  }

  function leadNudge() {
    const el = addBot('¿Quieres que un asesor humano te prepare una propuesta a tu medida?');
    el.classList.add('chat-lead');
    const cta = document.createElement('div'); cta.className = 'chat-srcs'; cta.style.marginTop = '.6rem';
    cta.innerHTML = `<a href="#cotizar" style="border-color:var(--gold-600);color:var(--gold-300)">Sí, cotizar →</a>`;
    cta.querySelector('a').addEventListener('click', close);
    el.appendChild(cta);
  }

  send.addEventListener('click', () => { const t = input.value; input.value = ''; askInternal(t); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const t = input.value; input.value = ''; askInternal(t); } });

  // API pública para que otras partes abran el chat con una pregunta
  window.TSSIChat = { ask(q) { open(); setTimeout(() => askInternal(q), 350); } };
})();
