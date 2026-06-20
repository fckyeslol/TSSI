/* TSSI — interacciones de la home (hero + wizard + lead). Cargar tras common.js */
(() => {
  'use strict';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  if (!$('#cotizar')) return;

  /* ---------- WIZARD ---------- */
  const wiz = { step: 1, data: {} };
  const panels = $$('.panel');
  const wbar = $('#wizBar'), wback = $('#wizBack'), wnext = $('#wizNext');

  function showStep(n) {
    wiz.step = n;
    panels.forEach(p => p.classList.toggle('active', +p.dataset.panel === n));
    $$('#wizSteps .wstep').forEach((s, i) => { s.classList.toggle('active', i === n - 1); s.classList.toggle('done', i < n - 1); });
    wbar.style.width = (n / 4 * 100) + '%';
    wback.classList.toggle('show', n > 1 && n < 4);
    wnext.style.display = n >= 4 ? 'none' : 'inline-flex';
    const arrow = '<svg viewBox="0 0 24 24" width="18"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none"/></svg>';
    wnext.innerHTML = (n === 3 ? 'Enviar solicitud ' : 'Continuar ') + arrow;
  }

  $$('[data-wopt]').forEach(grid => grid.addEventListener('click', e => {
    const opt = e.target.closest('.opt'); if (!opt) return;
    $$('.opt', grid).forEach(o => o.classList.remove('sel'));
    opt.classList.add('sel'); wiz.data[grid.dataset.wopt] = opt.dataset.val;
  }));

  wnext?.addEventListener('click', () => {
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
  wback?.addEventListener('click', () => showStep(Math.max(wiz.step - 1, 1)));

  function prefill(cat) {
    const opt = $(`[data-wopt="categoria"] .opt[data-val="${cat}"]`);
    if (opt) { $$('[data-wopt="categoria"] .opt').forEach(o => o.classList.remove('sel')); opt.classList.add('sel'); wiz.data.categoria = cat; }
    $('#cotizar').scrollIntoView({ behavior: 'smooth' });
  }
  $$('#needGrid .need').forEach(b => b.addEventListener('click', () => {
    const map = { salud: 'Salud', movilidad: 'Movilidad', hogar: 'Hogar', empresa: 'Empresa' };
    prefill(map[b.dataset.need] || 'Salud');
  }));

  function shake(el) { el?.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }

  /* ---------- lead form ---------- */
  $('#leadForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    saveLead({ ...fd, fuente: 'form' });
    e.target.innerHTML = `<div class="wizard-success" style="display:grid"><div class="check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg></div><h3 style="font-family:var(--display)">¡Gracias, ${(fd.nombre || '').split(' ')[0]}!</h3><p style="color:var(--ink-soft)">Tu solicitud fue recibida. Un asesor te contactará muy pronto.</p></div>`;
  });

  function saveLead(lead) {
    try { const l = JSON.parse(localStorage.getItem('tssi_leads') || '[]'); l.push({ ...lead, ts: new Date().toISOString() }); localStorage.setItem('tssi_leads', JSON.stringify(l)); } catch (_) {}
    fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) }).catch(() => {});
  }

  showStep(1);
})();
