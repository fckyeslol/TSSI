/* TSSI — catálogo de página de línea (Personas / Empresas / ARL). Cargar tras common.js */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = $('#catalogPage');
  if (!root) return;
  const LINE = root.dataset.line;

  const params = new URLSearchParams(location.search);
  const wantRamo = params.get('ramo');
  let search = '';

  const TIPO = { afiliacion: 'Afiliación', certificado: 'Certificados', tramite: 'Trámites', reclamacion: 'Reclamaciones', reporte: 'Reportes', pago: 'Pagos', cotizacion: 'Cotización' };

  window.loadCatalogo.then(data => {
    window.__CAT = data;
    if (LINE === 'arl') initArl(data); else initLine(data);
  });

  /* ============ PERSONAS / EMPRESAS ============ */
  function initLine(data) {
    const linea = data.lineas.find(l => l.id === LINE);
    const prods = data.productos.filter(p => p.linea === LINE);
    const bar = $('#ramoBar'), groups = $('#groups');

    bar.innerHTML = `<div class="cat-ramos" id="ramoPills">
        <button class="ramo-pill active" data-ramo="all">Todos</button>
        ${linea.ramos.map(r => `<button class="ramo-pill" data-ramo="${r.id}">${r.nombre}</button>`).join('')}
      </div>
      <div class="cat-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input id="catSearch" placeholder="Buscar seguro o cobertura…" /></div>`;

    function render() {
      const q = search.toLowerCase();
      groups.innerHTML = linea.ramos.map(r => {
        let items = prods.filter(p => p.ramoId === r.id);
        if (q) items = items.filter(p => (p.nombre + ' ' + (p.resumen || '') + ' ' + p.ramo).toLowerCase().includes(q));
        if (!items.length) return '';
        return `<section class="ramo-group" id="g-${r.id}">
          <div class="ramo-group-head"><h2>${r.nombre}</h2><span class="count">${items.length} ${items.length === 1 ? 'solución' : 'soluciones'}</span></div>
          <div class="cat-grid">${items.map(cardHTML).join('')}</div></section>`;
      }).join('') || `<div class="empty-state">Sin resultados para “${search}”.</div>`;
      bindCards(prods);
    }

    $('#catSearch')?.addEventListener('input', e => { search = e.target.value.trim(); render(); });
    $$('.ramo-pill', bar).forEach(p => p.addEventListener('click', () => {
      $$('.ramo-pill', bar).forEach(x => x.classList.remove('active')); p.classList.add('active');
      const rid = p.dataset.ramo;
      if (rid === 'all') window.scrollTo({ top: $('#groups').offsetTop - 130, behavior: 'smooth' });
      else $('#g-' + rid)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));

    render();
    stickyBar();
    if (wantRamo) setTimeout(() => {
      const pill = $(`.ramo-pill[data-ramo="${wantRamo}"]`, bar);
      if (pill) { $$('.ramo-pill', bar).forEach(x => x.classList.remove('active')); pill.classList.add('active'); }
      $('#g-' + wantRamo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }

  function cardHTML(p) {
    return `<article class="prod-card" data-slug="${p.slug}">
      <span class="ramo-lbl">${p.ramo}</span>
      <h4>${p.nombre}</h4>
      <p>${p.resumen || p.descripcion || ''}</p>
      <div class="meta">${p.coberturas.incluidas.length ? `<span class="tag">${p.coberturas.incluidas.length} coberturas</span>` : ''}${p.es_digital ? '<span class="tag digital">100% digital</span>' : ''}</div>
      <span class="more">Ver detalle <svg viewBox="0 0 24 24" width="14"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></span>
    </article>`;
  }
  function bindCards(prods) {
    $$('.prod-card[data-slug]').forEach(c => c.addEventListener('click', () => openModal(prods.find(x => x.slug === c.dataset.slug))));
  }

  /* ============ ARL ============ */
  function initArl(data) {
    const bar = $('#ramoBar'), groups = $('#groups');
    const procs = data.procesos;
    const tipos = [...new Set(procs.map(p => p.tipo))];
    bar.innerHTML = `<div class="cat-ramos">
        <button class="ramo-pill active" data-t="all">Todos</button>
        ${tipos.map(t => `<button class="ramo-pill" data-t="${t}">${TIPO[t] || t}</button>`).join('')}
      </div>
      <div class="cat-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>
        <input id="catSearch" placeholder="Buscar trámite…" /></div>`;

    function render() {
      const q = search.toLowerCase();
      groups.innerHTML = tipos.map(t => {
        let items = procs.filter(p => p.tipo === t);
        if (q) items = items.filter(p => (p.nombre + ' ' + (p.descripcion || '')).toLowerCase().includes(q));
        if (!items.length) return '';
        return `<section class="ramo-group" id="gt-${t}">
          <div class="ramo-group-head"><h2>${TIPO[t] || t}</h2><span class="count">${items.length}</span></div>
          <div class="cat-grid">${items.map(procCard).join('')}</div></section>`;
      }).join('') || `<div class="empty-state">Sin resultados.</div>`;
      $$('.prod-card[data-proc]').forEach(c => c.addEventListener('click', () => openProc(procs.find(x => x.slug === c.dataset.proc))));
    }
    $('#catSearch')?.addEventListener('input', e => { search = e.target.value.trim(); render(); });
    $$('.ramo-pill', bar).forEach(p => p.addEventListener('click', () => {
      $$('.ramo-pill', bar).forEach(x => x.classList.remove('active')); p.classList.add('active');
      const t = p.dataset.t;
      if (t === 'all') window.scrollTo({ top: $('#groups').offsetTop - 130, behavior: 'smooth' });
      else $('#gt-' + t)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    render(); stickyBar();
  }
  function procCard(p) {
    const aud = p.dirigido_a === 'juridica' ? 'Empresas' : p.dirigido_a === 'natural' ? 'Independientes' : 'General';
    return `<article class="prod-card" data-proc="${p.slug}">
      <span class="ramo-lbl">${aud}</span><h4>${p.nombre}</h4>
      <p>${p.descripcion || ''}</p>
      <div class="meta">${(p.pasos || []).length ? `<span class="tag">${p.pasos.length} pasos</span>` : ''}</div>
      <span class="more">Ver detalle <svg viewBox="0 0 24 24" width="14"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></span></article>`;
  }

  /* ============ STICKY BAR sombra ============ */
  function stickyBar() {
    const bar = $('.ramo-bar'); if (!bar) return;
    const io = new IntersectionObserver(([e]) => bar.classList.toggle('stuck', e.intersectionRatio < 1), { threshold: [1] });
    io.observe(bar);
  }

  /* ============ MODAL ============ */
  const modalBg = $('#modalBg'), modal = $('#modal');
  const close = () => modalBg.classList.remove('open');
  modalBg.addEventListener('click', e => { if (e.target === modalBg) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  function covGroup(cls, label, arr) {
    if (!arr.length) return '';
    return `<div class="cov-group ${cls}"><h5>${label}</h5><div class="cov-list">${arr.slice(0, 40).map(c =>
      `<div class="cov-item"><span class="dot"></span><span>${c.nombre}${c.limite ? ` <small>· ${c.limite}</small>` : ''}</span></div>`).join('')}</div></div>`;
  }
  function openModal(p) {
    if (!p) return;
    modal.innerHTML = `
      <div class="modal-head"><button class="modal-close" id="mClose"><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <span class="ramo-lbl">${p.linea === 'personas' ? 'Personas' : 'Empresas'} · ${p.ramo}</span>
        <h3>${p.nombre}</h3>${p.es_digital ? '<span class="tag digital">100% digital</span>' : ''}</div>
      <div class="modal-body">
        <p style="color:var(--ink-soft);margin-bottom:1.4rem">${p.descripcion || p.resumen || ''}</p>
        ${p.elegibilidad?.descripcion ? `<div class="cov-group"><h5 style="color:var(--navy-700)">¿A quién aplica?</h5><p style="font-size:.9rem;color:var(--ink-soft)">${p.elegibilidad.descripcion}</p></div>` : ''}
        ${covGroup('inc', '✓ Qué cubre', p.coberturas.incluidas)}
        ${covGroup('opc', '＋ Coberturas opcionales', p.coberturas.opcionales)}
        ${covGroup('exc', '✕ Qué no cubre', p.coberturas.excluidas)}
        <div class="modal-cta">
          <a href="/#cotizar" class="btn btn-gold">Cotizar este seguro <svg viewBox="0 0 24 24" width="18"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></a>
          <button class="btn btn-ghost" style="color:var(--ink);border-color:rgba(30,37,54,.18)" id="mAsk">Preguntar al asistente</button>
        </div></div>`;
    modalBg.classList.add('open');
    $('#mClose').addEventListener('click', close);
    $('#mAsk').addEventListener('click', () => { close(); window.TSSIChat?.ask(`¿Qué cubre ${p.nombre}?`); });
  }
  function openProc(p) {
    if (!p) return;
    const aud = p.dirigido_a === 'juridica' ? 'Empresas' : p.dirigido_a === 'natural' ? 'Independientes' : 'General';
    const pasos = (p.pasos || []).map((s, i) => `<div class="cov-item"><span class="dot" style="background:var(--gold-600)"></span><span><b>${s.titulo || 'Paso ' + (i + 1)}</b>${s.detalle ? `<br><small>${s.detalle}</small>` : ''}</span></div>`).join('');
    modal.innerHTML = `
      <div class="modal-head"><button class="modal-close" id="mClose"><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <span class="ramo-lbl">ARL · ${aud}</span><h3>${p.nombre}</h3></div>
      <div class="modal-body"><p style="color:var(--ink-soft);margin-bottom:1.4rem">${p.descripcion || ''}</p>
        ${pasos ? `<div class="cov-group"><h5 style="color:var(--navy-700)">Paso a paso</h5><div class="cov-list">${pasos}</div></div>` : ''}
        <div class="modal-cta"><a href="/#contacto" class="btn btn-gold">Gestionar con un asesor</a>
          <button class="btn btn-ghost" style="color:var(--ink);border-color:rgba(30,37,54,.18)" id="mAsk">Preguntar al asistente</button></div></div>`;
    modalBg.classList.add('open');
    $('#mClose').addEventListener('click', close);
    $('#mAsk').addEventListener('click', () => { close(); window.TSSIChat?.ask(`${p.nombre}: ¿cómo es el proceso?`); });
  }
})();
