/* TSSI — chrome compartido (nav, footer, modal, chatbot) + utilidades. Cargar PRIMERO. */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const page = document.body.dataset.page || 'home';

  // ---- carga de datos compartida (una sola vez) ----
  window.loadCatalogo = window.loadCatalogo || fetch('/data/catalogo.json').then(r => r.json());

  const RAMO_DESC = {
    'Salud': 'Pólizas, EPS y bienestar', 'Vida': 'Vida, pensión, educación', 'Hogar y Vivienda': 'Hogar, arriendo, mascotas',
    'Movilidad': 'Auto, moto, bicicleta', 'Responsabilidad Civil': 'Protección ante terceros', 'Cumplimiento': 'Contratos y garantías',
    'Transporte': 'Carga y mercancías', 'Construcción': 'Obras y montajes', 'Agro': 'Cosecha, ganado', 'Energía': 'Proyectos energéticos',
    'Colectivos': 'Soluciones grupales', 'Sectores': 'Por industria', 'Otros': 'Más soluciones',
  };

  /* ---------- markup del NAV ---------- */
  const navHTML = `
  <header class="nav" id="nav">
    <div class="wrap nav-inner">
      <a href="/" class="logo">
        <img src="/assets/img/logo.jpg" alt="TSSI" />
        <span class="logo-txt"><b>TENDENCIAS</b><span>Seguros & Servicios Integrales</span></span>
      </a>
      <nav class="nav-menu">
        <div class="nav-item">
          <a class="nav-link ${page === 'personas' ? 'active' : ''}" href="/personas">Personas <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></a>
          <div class="mega" data-mega="personas"><div class="mega-grid"></div>
            <div class="mega-foot"><span class="eyebrow">Para ti y tu familia</span><a href="/personas">Ver todo en Personas →</a></div></div>
        </div>
        <div class="nav-item">
          <a class="nav-link ${page === 'empresas' ? 'active' : ''}" href="/empresas">Empresas <svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 10l5 5 5-5z"/></svg></a>
          <div class="mega" data-mega="empresas"><div class="mega-grid"></div>
            <div class="mega-foot"><span class="eyebrow">Protección corporativa</span><a href="/empresas">Ver todo en Empresas →</a></div></div>
        </div>
        <a class="nav-link ${page === 'arl' ? 'active' : ''}" href="/arl">ARL</a>
        <a class="nav-link" href="/#proceso">Cómo trabajamos</a>
        <a class="nav-link" href="/#contacto">Contacto</a>
      </nav>
      <div class="nav-cta">
        <a href="/#cotizar" class="btn btn-gold">Cotizar ahora <svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg></a>
        <button class="btn btn-ghost burger" id="burger" aria-label="Menú">☰</button>
      </div>
    </div>
  </header>
  <div class="drawer-backdrop" id="drawerBackdrop"></div>
  <div class="drawer" id="drawer">
    <button class="drawer-close" id="drawerClose">✕</button>
    <a href="/personas">Personas</a><a href="/empresas">Empresas</a><a href="/arl">ARL</a>
    <a href="/#proceso">Cómo trabajamos</a><a href="/#contacto">Contacto</a>
    <a href="/#cotizar" style="color:var(--gold-500)">Cotizar ahora →</a>
  </div>`;

  /* ---------- markup FOOTER + MODAL + CHATBOT ---------- */
  const footHTML = `
  <footer class="footer">
    <div class="wrap">
      <div class="foot-grid">
        <div class="foot-brand">
          <a href="/" class="logo"><img src="/assets/img/logo.jpg" alt="TSSI" /><span class="logo-txt"><b>TENDENCIAS</b><span>Seguros & Servicios Integrales</span></span></a>
          <p>Correduría de seguros independiente. Asesoría experta para personas, empresas y riesgos laborales en Colombia.</p>
        </div>
        <div class="foot-col"><h5>Personas</h5><a href="/personas?ramo=personas-salud">Salud</a><a href="/personas?ramo=personas-vida">Vida</a><a href="/personas?ramo=personas-hogar-y-vivienda">Hogar</a><a href="/personas?ramo=personas-movilidad">Movilidad</a></div>
        <div class="foot-col"><h5>Empresas</h5><a href="/empresas?ramo=empresas-responsabilidad-civil">Responsabilidad Civil</a><a href="/empresas?ramo=empresas-cumplimiento">Cumplimiento</a><a href="/empresas?ramo=empresas-transporte">Transporte</a><a href="/empresas">Ver todo</a></div>
        <div class="foot-col"><h5>Compañía</h5><a href="/#proceso">Cómo trabajamos</a><a href="/arl">ARL</a><a href="/#contacto">Contacto</a><a href="/#cotizar">Cotizar</a></div>
      </div>
      <div class="foot-bottom">
        <span>© 2026 Tendencias en Seguros y Servicios Integrales (TSSI). Todos los derechos reservados.</span>
        <span>Hecho con precisión · Asistente IA local</span>
      </div>
    </div>
  </footer>
  <div class="modal-bg" id="modalBg"><div class="modal" id="modal"></div></div>
  <button class="chat-fab" id="chatFab" aria-label="Abrir asistente"><span class="ping"></span>
    <span class="fab-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 01-8.5 8.5 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 01-.9-3.8A8.38 8.38 0 0112.5 3 8.5 8.5 0 0121 11.5z"/></svg></span>
    <span class="fab-label">Pregúntale a TSSI</span>
  </button>
  <div class="chat-panel" id="chatPanel">
    <div class="chat-top"><div class="av">T</div>
      <div><b>Asistente TSSI</b><small>En línea · IA</small></div>
      <button class="chat-x" id="chatX" aria-label="Cerrar"><svg viewBox="0 0 24 24" width="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </div>
    <div class="chat-body" id="chatBody"></div>
    <div class="chat-suggest" id="chatSuggest"></div>
    <div class="chat-input">
      <input id="chatInput" placeholder="Pregunta sobre coberturas…" autocomplete="off" />
      <button id="chatSend" aria-label="Enviar"><svg viewBox="0 0 24 24" width="20"><path fill="currentColor" d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/></svg></button>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('afterbegin', navHTML);
  document.body.insertAdjacentHTML('beforeend', footHTML);

  /* ---------- nav scroll ---------- */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 30);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- drawer ---------- */
  const drawer = $('#drawer'), backdrop = $('#drawerBackdrop');
  const openDrawer = () => { drawer.classList.add('open'); backdrop.classList.add('open'); };
  const closeDrawer = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); };
  $('#burger')?.addEventListener('click', openDrawer);
  $('#drawerClose')?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  $$('#drawer a').forEach(a => a.addEventListener('click', closeDrawer));

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
  const observeReveals = () => $$('[data-reveal]:not(.in)').forEach(el => io.observe(el));
  observeReveals();
  window.TSSIobserve = observeReveals;

  /* ---------- contadores animados ---------- */
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const dur = 1600; const t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1);
      el.textContent = Math.round(target * ease(p)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const countIO = new IntersectionObserver((es) => es.forEach(e => {
    if (e.isIntersecting) { animateCount(e.target); countIO.unobserve(e.target); }
  }), { threshold: 0.6 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  /* ---------- parallax suave ---------- */
  const parallaxEls = $$('[data-parallax]');
  if (parallaxEls.length) {
    let ticking = false;
    const apply = () => {
      parallaxEls.forEach(el => {
        const r = el.getBoundingClientRect();
        const f = parseFloat(el.dataset.parallax) || 0.05;
        const off = (r.top + r.height / 2 - innerHeight / 2) * -f;
        el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0) scale(1.06)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }, { passive: true });
    apply();
  }

  /* ---------- mega menú (async) ---------- */
  window.loadCatalogo.then(data => {
    ['personas', 'empresas'].forEach(lid => {
      const linea = data.lineas.find(l => l.id === lid);
      const grid = $(`.mega[data-mega="${lid}"] .mega-grid`);
      if (!linea || !grid) return;
      grid.innerHTML = linea.ramos.map(r =>
        `<a class="mega-link" href="/${lid}?ramo=${r.id}"><b>${r.nombre}</b><small>${RAMO_DESC[r.nombre] || r.productos.length + ' soluciones'}</small></a>`).join('');
    });
  }).catch(() => {});
})();
