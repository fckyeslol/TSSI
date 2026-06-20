/* TSSI — interacciones del sitio */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  let DATA = { lineas: [], productos: [], procesos: [] };

  /* ---------- NAV scroll ---------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- mobile drawer ---------- */
  const drawer = $('#drawer');
  $('#burger')?.addEventListener('click', () => drawer.classList.add('open'));
  $('#drawerClose')?.addEventListener('click', () => drawer.classList.remove('open'));
  $$('#drawer a').forEach(a => a.addEventListener('click', () => drawer.classList.remove('open')));

  /* ---------- scroll reveal ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));

  /* ---------- carga de datos ---------- */
  fetch('/data/catalogo.json').then(r => r.json()).then(d => { DATA = d; buildMega(); buildCatalog(); }).catch(console.error);

  const RAMO_DESC = {
    'Salud': 'Pólizas, EPS y bienestar', 'Vida': 'Vida, pensión, educación', 'Hogar y Vivienda': 'Hogar, arriendo, mascotas',
    'Movilidad': 'Auto, moto, bicicleta', 'Responsabilidad Civil': 'Protección ante terceros', 'Cumplimiento': 'Contratos y garantías',
    'Transporte': 'Carga y mercancías', 'Construcción': 'Obras y montajes', 'Agro': 'Cosecha, ganado', 'Energía': 'Proyectos energéticos',
    'Colectivos': 'Soluciones grupales', 'Sectores': 'Por industria', 'Otros': 'Más soluciones',
  };

  /* ---------- mega menú ---------- */
  function buildMega() {
    ['personas', 'empresas'].forEach(lid => {
      const linea = DATA.lineas.find(l => l.id === lid);
      const grid = $(`.mega[data-mega="${lid}"] .mega-grid`);
      if (!linea || !grid) return;
      grid.innerHTML = linea.ramos.map(r =>
        `<a class="mega-link" href="#soluciones" data-line="${lid}" data-ramo="${r.id}">
           <b>${r.nombre}</b><small>${RAMO_DESC[r.nombre] || r.productos.length + ' soluciones'}</small></a>`).join('');
    });
    bindLineLinks();
  }

  /* enlaces que saltan al catálogo en una línea/ramo */
  function bindLineLinks() {
    $$('[data-line]').forEach(el => el.addEventListener('click', () => {
      const line = el.dataset.line, ramo = el.dataset.ramo;
      setTab(line);
      if (ramo) setTimeout(() => selectRamo(ramo), 50);
    }));
  }

  /* ====================================================================
     CATÁLOGO
     ==================================================================== */
  let curTab = 'personas', curRamo = 'all', curSearch = '';

  function setTab(tab) {
    curTab = tab; curRamo = 'all';
    $$('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    renderRamos(); renderGrid();
  }
  function selectRamo(rid) {
    curRamo = rid;
    $$('.ramo-pill').forEach(p => p.classList.toggle('active', p.dataset.ramo === rid));
    renderGrid();
  }

  $$('.cat-tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
  $('#catSearch')?.addEventListener('input', e => { curSearch = e.target.value.toLowerCase().trim(); renderGrid(); });

  function renderRamos() {
    const box = $('#catRamos');
    if (curTab === 'arl') { box.innerHTML = ''; return; }
    const linea = DATA.lineas.find(l => l.id === curTab);
    if (!linea) return;
    box.innerHTML = `<button class="ramo-pill active" data-ramo="all">Todos</button>` +
      linea.ramos.map(r => `<button class="ramo-pill" data-ramo="${r.id}">${r.nombre}</button>`).join('');
    $$('.ramo-pill', box).forEach(p => p.addEventListener('click', () => selectRamo(p.dataset.ramo)));
  }

  function renderGrid() {
    const grid = $('#catGrid');
    if (curTab === 'arl') { renderArl(grid); return; }
    let items = DATA.productos.filter(p => p.linea === curTab);
    if (curRamo !== 'all') items = items.filter(p => p.ramoId === curRamo);
    if (curSearch) items = items.filter(p =>
      (p.nombre + ' ' + (p.resumen || '') + ' ' + p.ramo).toLowerCase().includes(curSearch));
    if (!items.length) { grid.innerHTML = `<p style="color:var(--ink-soft);grid-column:1/-1">Sin resultados para “${curSearch}”.</p>`; return; }
    grid.innerHTML = items.map((p, i) => `
      <article class="prod-card" data-slug="${p.slug}" style="animation:panelIn .5s var(--ease) ${i % 12 * 0.03}s both">
        <span class="ramo-lbl">${p.ramo}</span>
        <h4>${p.nombre}</h4>
        <p>${p.resumen || p.descripcion || ''}</p>
        <div class="meta">
          <span class="tag">${p.coberturas.incluidas.length} coberturas</span>
          ${p.es_digital ? '<span class="tag digital">100% digital</span>' : ''}
        </div>
        <span class="more">Ver detalle <svg viewBox="0 0 24 24" width="14"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></span>
      </article>`).join('');
    $$('.prod-card', grid).forEach(c => c.addEventListener('click', () => openModal(c.dataset.slug)));
  }

  function renderArl(grid) {
    $('#catRamos').innerHTML = '';
    let items = DATA.procesos;
    if (curSearch) items = items.filter(p => (p.nombre + ' ' + (p.descripcion || '')).toLowerCase().includes(curSearch));
    const TIPO = { afiliacion: 'Afiliación', certificado: 'Certificados', tramite: 'Trámite', reclamacion: 'Reclamación', reporte: 'Reporte', pago: 'Pago' };
    grid.innerHTML = items.map((p, i) => `
      <article class="prod-card" data-proc="${p.slug}" style="animation:panelIn .5s var(--ease) ${i % 12 * 0.03}s both">
        <span class="ramo-lbl">${TIPO[p.tipo] || 'ARL'} · ${p.dirigido_a === 'juridica' ? 'Empresas' : p.dirigido_a === 'natural' ? 'Independientes' : 'General'}</span>
        <h4>${p.nombre}</h4>
        <p>${p.descripcion || ''}</p>
        <div class="meta"><span class="tag">${(p.pasos || []).length} pasos</span></div>
        <span class="more">Ver detalle <svg viewBox="0 0 24 24" width="14"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></span>
      </article>`).join('');
    $$('.prod-card', grid).forEach(c => c.addEventListener('click', () => openProc(c.dataset.proc)));
  }

  function buildCatalog() { renderRamos(); renderGrid(); }

  /* ---------- modal producto ---------- */
  const modalBg = $('#modalBg'), modal = $('#modal');
  const closeModal = () => modalBg.classList.remove('open');
  modalBg.addEventListener('click', e => { if (e.target === modalBg) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  function covGroup(cls, label, arr) {
    if (!arr.length) return '';
    return `<div class="cov-group ${cls}"><h5>${label}</h5><div class="cov-list">${arr.slice(0, 30).map(c =>
      `<div class="cov-item"><span class="dot"></span><span>${c.nombre}${c.limite ? ` <small>· ${c.limite}</small>` : ''}</span></div>`).join('')}</div></div>`;
  }

  function openModal(slug) {
    const p = DATA.productos.find(x => x.slug === slug); if (!p) return;
    modal.innerHTML = `
      <div class="modal-head">
        <button class="modal-close" id="mClose"><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <span class="ramo-lbl">${p.linea === 'personas' ? 'Personas' : 'Empresas'} · ${p.ramo}</span>
        <h3>${p.nombre}</h3>
        ${p.es_digital ? '<span class="tag digital">100% digital</span>' : ''}
      </div>
      <div class="modal-body">
        <p style="color:var(--ink-soft);margin-bottom:1.4rem">${p.descripcion || p.resumen || ''}</p>
        ${p.elegibilidad?.descripcion ? `<div class="cov-group"><h5 style="color:var(--navy-700)">¿A quién aplica?</h5><p style="font-size:.9rem;color:var(--ink-soft)">${p.elegibilidad.descripcion}</p></div>` : ''}
        ${covGroup('inc', '✓ Qué cubre', p.coberturas.incluidas)}
        ${covGroup('opc', '＋ Coberturas opcionales', p.coberturas.opcionales)}
        ${covGroup('exc', '✕ Qué no cubre', p.coberturas.excluidas)}
        <div class="modal-cta">
          <a href="#cotizar" class="btn btn-gold" id="mQuote">Cotizar este seguro <svg viewBox="0 0 24 24" width="18"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></a>
          <button class="btn btn-ghost" style="color:var(--ink);border-color:rgba(30,37,54,.18)" id="mAsk">Preguntar al asistente</button>
        </div>
      </div>`;
    modalBg.classList.add('open');
    $('#mClose').addEventListener('click', closeModal);
    $('#mQuote').addEventListener('click', () => { closeModal(); prefillWizard(p.ramo); });
    $('#mAsk').addEventListener('click', () => { closeModal(); window.TSSIChat?.ask(`¿Qué cubre ${p.nombre}?`); });
  }

  function openProc(slug) {
    const p = DATA.procesos.find(x => x.slug === slug); if (!p) return;
    const pasos = (p.pasos || []).map((s, i) => `<div class="cov-item"><span class="dot" style="background:var(--gold-600)"></span><span><b>${s.titulo || 'Paso ' + (i + 1)}</b>${s.detalle ? `<br><small>${s.detalle}</small>` : ''}</span></div>`).join('');
    modal.innerHTML = `
      <div class="modal-head">
        <button class="modal-close" id="mClose"><svg viewBox="0 0 24 24" width="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <span class="ramo-lbl">ARL · ${p.dirigido_a === 'juridica' ? 'Empresas' : p.dirigido_a === 'natural' ? 'Independientes' : 'General'}</span>
        <h3>${p.nombre}</h3>
      </div>
      <div class="modal-body">
        <p style="color:var(--ink-soft);margin-bottom:1.4rem">${p.descripcion || ''}</p>
        ${pasos ? `<div class="cov-group"><h5 style="color:var(--navy-700)">Paso a paso</h5><div class="cov-list">${pasos}</div></div>` : ''}
        <div class="modal-cta">
          <a href="#contacto" class="btn btn-gold" id="mClose2">Gestionar con un asesor</a>
          <button class="btn btn-ghost" style="color:var(--ink);border-color:rgba(30,37,54,.18)" id="mAsk">Preguntar al asistente</button>
        </div>
      </div>`;
    modalBg.classList.add('open');
    $('#mClose').addEventListener('click', closeModal);
    $('#mClose2').addEventListener('click', closeModal);
    $('#mAsk').addEventListener('click', () => { closeModal(); window.TSSIChat?.ask(`${p.nombre}: ¿cómo es el proceso?`); });
  }

  /* ====================================================================
     WIZARD / FUNNEL
     ==================================================================== */
  const wiz = { step: 1, data: {} };
  const panels = $$('.panel');
  const wbar = $('#wizBar'), wback = $('#wizBack'), wnext = $('#wizNext');

  function showStep(n) {
    wiz.step = n;
    panels.forEach(p => p.classList.toggle('active', +p.dataset.panel === n));
    $$('#wizSteps .wstep').forEach((s, i) => {
      s.classList.toggle('active', i === n - 1);
      s.classList.toggle('done', i < n - 1);
    });
    wbar.style.width = (n / 4 * 100) + '%';
    wback.classList.toggle('show', n > 1 && n < 4);
    wnext.style.display = n >= 4 ? 'none' : 'inline-flex';
    wnext.innerHTML = n === 3 ? 'Enviar solicitud <svg viewBox="0 0 24 24" width="18"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg>' : 'Continuar <svg viewBox="0 0 24 24" width="18"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
  }

  // selección de opciones
  $$('[data-wopt]').forEach(grid => {
    grid.addEventListener('click', e => {
      const opt = e.target.closest('.opt'); if (!opt) return;
      $$('.opt', grid).forEach(o => o.classList.remove('sel'));
      opt.classList.add('sel');
      wiz.data[grid.dataset.wopt] = opt.dataset.val;
    });
  });

  wnext.addEventListener('click', () => {
    if (wiz.step === 1 && !wiz.data.categoria) return shake($('[data-panel="1"]'));
    if (wiz.step === 2) wiz.data.urgencia = $('#wizUrgencia').value;
    if (wiz.step === 3) {
      const nombre = $('#wizNombre').value.trim(), email = $('#wizEmail').value.trim();
      if (!nombre || !email) return shake($('[data-panel="3"]'));
      wiz.data.nombre = nombre; wiz.data.email = email; wiz.data.tel = $('#wizTel').value.trim();
      $('#wizResumen').textContent = `${nombre.split(' ')[0]}, un asesor TSSI te contactará pronto con tu propuesta de ${(wiz.data.categoria || 'seguro').toLowerCase()}. Revisamos cada caso de forma personalizada.`;
      saveLead({ ...wiz.data, fuente: 'wizard' });
    }
    showStep(Math.min(wiz.step + 1, 4));
  });
  wback.addEventListener('click', () => showStep(Math.max(wiz.step - 1, 1)));

  function prefillWizard(ramo) {
    const map = { 'Salud': 'Salud', 'Vida': 'Vida', 'Movilidad': 'Movilidad', 'Hogar y Vivienda': 'Hogar' };
    const cat = map[ramo] || 'Empresa';
    const opt = $(`[data-wopt="categoria"] .opt[data-val="${cat}"]`);
    if (opt) { $$('[data-wopt="categoria"] .opt').forEach(o => o.classList.remove('sel')); opt.classList.add('sel'); wiz.data.categoria = cat; }
    document.querySelector('#cotizar').scrollIntoView({ behavior: 'smooth' });
  }

  // entrada desde el hero
  $$('#needGrid .need').forEach(b => b.addEventListener('click', () => {
    const map = { salud: 'Salud', movilidad: 'Movilidad', hogar: 'Hogar', empresa: 'Empresa' };
    prefillWizard(Object.keys(map).find(k => k === b.dataset.need) ? (b.dataset.need === 'salud' ? 'Salud' : b.dataset.need === 'movilidad' ? 'Movilidad' : b.dataset.need === 'hogar' ? 'Hogar y Vivienda' : '') : '');
  }));

  function shake(el) { el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }

  /* ---------- lead form ---------- */
  $('#leadForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    saveLead({ ...fd, fuente: 'form' });
    e.target.innerHTML = `<div class="wizard-success" style="display:grid"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></div><h3 style="font-family:var(--display)">¡Gracias, ${(fd.nombre||'').split(' ')[0]}!</h3><p style="color:var(--ink-soft)">Tu solicitud fue recibida. Un asesor te contactará muy pronto.</p></div>`;
  });

  function saveLead(lead) {
    try {
      const leads = JSON.parse(localStorage.getItem('tssi_leads') || '[]');
      leads.push({ ...lead, ts: new Date().toISOString() });
      localStorage.setItem('tssi_leads', JSON.stringify(leads));
    } catch (_) {}
    // intento opcional de enviar al backend (si existe)
    fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).catch(() => {});
  }

  showStep(1);
  // exponer para el chatbot
  window.TSSI = { openModal, prefillWizard };
})();
