// Consolida sura-db/seed/raw/*.json -> seed normalizado + load.sql
// Dedup determinístico de coberturas por slug. Sin LLM.
const fs = require('fs'), path = require('path');
// script vive en sura-db/scripts/ -> seed está en ../seed
const SEED = path.resolve(__dirname, '..', 'seed');
const RAW = path.join(SEED, 'raw');

const files = fs.readdirSync(RAW).filter(f => f.endsWith('.json'));
const productos = [], planes = [], planCob = [], elegibilidad = [];
const documentos = [], procesos = [], chunks = [];
const coberturas = new Map();           // slug -> {slug,nombre,descripcion,categoria}
const canales = [];                     // {producto_slug, canal}

const S = v => (v === undefined ? null : v);

for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8')); }
  catch (e) { console.error('JSON inválido:', f, e.message); continue; }

  if (d.tipo === 'producto' && d.producto) {
    const p = d.producto;
    productos.push({
      slug: p.slug, nombre: p.nombre, ramo: p.ramo, linea: p.linea,
      tipo_persona: p.tipo_persona || 'natural', descripcion: S(p.descripcion),
      resumen: S(p.resumen), url: d.url, cotizador_url: S(p.cotizador_url),
      es_digital: !!p.es_digital,
    });
    for (const c of (p.canales || [])) canales.push({ producto_slug: p.slug, canal: c });

    // planes: si no hay, crear plan único
    let plist = (d.planes && d.planes.length) ? d.planes
      : [{ slug: p.slug + '-unico', nombre: 'Plan único', orden: 0, precio_desde: null }];
    for (const pl of plist) planes.push({
      producto_slug: p.slug, slug: pl.slug, nombre: pl.nombre,
      orden: pl.orden || 0, precio_desde: S(pl.precio_desde),
    });
    const defaultPlan = plist[0].slug;

    for (const c of (d.coberturas || [])) {
      const slug = c.slug;
      if (!coberturas.has(slug)) coberturas.set(slug, {
        slug, nombre: c.nombre, descripcion: S(c.descripcion), categoria: S(c.categoria),
      });
      planCob.push({
        producto_slug: p.slug,
        plan_slug: c.plan_slug || defaultPlan,
        cobertura_slug: slug, tipo: c.tipo || 'incluida', limite: S(c.limite),
      });
    }
    if (d.elegibilidad) elegibilidad.push({ producto_slug: p.slug, ...d.elegibilidad });
    for (const doc of (d.documentos || [])) documentos.push({ producto_slug: p.slug, ...doc });
    for (const ch of (d.chunks || [])) chunks.push({ producto_slug: p.slug, proceso_slug: null, url: d.url, ...ch });

  } else if (d.tipo === 'proceso' && d.proceso) {
    procesos.push({ ...d.proceso, url: d.url });
    for (const doc of (d.documentos || [])) documentos.push({ proceso_slug: d.proceso.slug, ...doc });
    for (const ch of (d.chunks || [])) chunks.push({ producto_slug: null, proceso_slug: d.proceso.slug, url: d.url, ...ch });

  } else if (d.tipo === 'referencia') {
    for (const ch of (d.chunks || [])) chunks.push({ producto_slug: null, proceso_slug: null, url: d.url, seccion: ch.seccion, contenido: ch.contenido });
  }
}

// un documento sin URL no sirve (y viola NOT NULL pdf_url): descartar
const documentosValidos = documentos.filter(d => d.pdf_url && String(d.pdf_url).trim());
documentos.length = 0; documentos.push(...documentosValidos);

const cobArr = [...coberturas.values()];
const out = { productos, planes, coberturas: cobArr, plan_coberturas: planCob,
  elegibilidad, canales, documentos, procesos, chunks };
for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(SEED, k + '.json'), JSON.stringify(v, null, 2));

// ---- load.sql (idempotente, usa slugs como claves naturales para resolver FKs) ----
const q = s => s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const b = v => v ? 'TRUE' : 'FALSE';
let sql = `-- Carga generada desde seed/*.json. Ejecutar tras schema.sql.\nBEGIN;\n\n`;

// ramos (derivados). slug incluye la linea para evitar colisiones (p.ej. "Otros" en personas vs empresas)
const slugify = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ramoSlugOf = (nombre, linea) => `${linea}-${slugify(nombre)}`;
const ramos = new Map();
for (const p of productos) { const key = p.ramo + '|' + p.linea; if (!ramos.has(key)) ramos.set(key, { nombre: p.ramo, linea: p.linea }); }
sql += `-- RAMOS\n`;
for (const r of ramos.values()) {
  sql += `INSERT INTO ramo(slug,nombre,linea) VALUES(${q(ramoSlugOf(r.nombre, r.linea))},${q(r.nombre)},${q(r.linea)}) ON CONFLICT(slug) DO NOTHING;\n`;
}
sql += `\n-- COBERTURAS (catálogo atómico)\n`;
for (const c of cobArr) sql += `INSERT INTO cobertura(slug,nombre,descripcion,categoria) VALUES(${q(c.slug)},${q(c.nombre)},${q(c.descripcion)},${q(c.categoria)}) ON CONFLICT(slug) DO NOTHING;\n`;

sql += `\n-- PRODUCTOS\n`;
for (const p of productos) {
  const ramoSlug = ramoSlugOf(p.ramo, p.linea);
  sql += `INSERT INTO producto(slug,nombre,ramo_id,linea,tipo_persona,descripcion,resumen,url,cotizador_url,es_digital) ` +
    `VALUES(${q(p.slug)},${q(p.nombre)},(SELECT id FROM ramo WHERE slug=${q(ramoSlug)}),${q(p.linea)},${q(p.tipo_persona)},${q(p.descripcion)},${q(p.resumen)},${q(p.url)},${q(p.cotizador_url)},${b(p.es_digital)}) ON CONFLICT(slug) DO NOTHING;\n`;
}
sql += `\n-- PLANES\n`;
for (const pl of planes) sql += `INSERT INTO plan(producto_id,slug,nombre,orden,precio_desde) VALUES((SELECT id FROM producto WHERE slug=${q(pl.producto_slug)}),${q(pl.slug)},${q(pl.nombre)},${pl.orden|0},${pl.precio_desde===null?'NULL':pl.precio_desde}) ON CONFLICT(producto_id,slug) DO NOTHING;\n`;

sql += `\n-- PLAN_COBERTURA\n`;
for (const pc of planCob) sql += `INSERT INTO plan_cobertura(plan_id,cobertura_id,tipo,limite) VALUES((SELECT pl.id FROM plan pl JOIN producto pr ON pr.id=pl.producto_id WHERE pr.slug=${q(pc.producto_slug)} AND pl.slug=${q(pc.plan_slug)}),(SELECT id FROM cobertura WHERE slug=${q(pc.cobertura_slug)}),${q(pc.tipo)},${q(pc.limite)}) ON CONFLICT DO NOTHING;\n`;

sql += `\n-- ELEGIBILIDAD\n`;
for (const e of elegibilidad) sql += `INSERT INTO elegibilidad(producto_id,tipo_persona,edad_min,edad_max,condiciones,descripcion) VALUES((SELECT id FROM producto WHERE slug=${q(e.producto_slug)}),${q(e.tipo_persona||'ambas')},${e.edad_min===null||e.edad_min===undefined?'NULL':e.edad_min},${e.edad_max===null||e.edad_max===undefined?'NULL':e.edad_max},${q(JSON.stringify(e.condiciones||{}))}::jsonb,${q(e.descripcion)});\n`;

sql += `\n-- CANALES\n`;
for (const c of canales) sql += `INSERT INTO producto_canal(producto_id,canal) VALUES((SELECT id FROM producto WHERE slug=${q(c.producto_slug)}),${q(c.canal)}) ON CONFLICT DO NOTHING;\n`;

sql += `\n-- DOCUMENTOS\n`;
for (const d of documentos) {
  const ref = d.producto_slug ? `(SELECT id FROM producto WHERE slug=${q(d.producto_slug)})` : 'NULL';
  sql += `INSERT INTO documento(producto_id,tipo,titulo,pdf_url) VALUES(${ref},${q(d.tipo||'condicionado')},${q(d.titulo)},${q(d.pdf_url)});\n`;
}

sql += `\n-- PROCESOS (ARL)\n`;
for (const p of procesos) sql += `INSERT INTO proceso(slug,nombre,linea,tipo,dirigido_a,pasos,url,descripcion) VALUES(${q(p.slug)},${q(p.nombre)},${q(p.linea||'arl')},${q(p.tipo||'tramite')},${q(p.dirigido_a||'ambas')},${q(JSON.stringify(p.pasos||[]))}::jsonb,${q(p.url)},${q(p.descripcion)}) ON CONFLICT(slug) DO NOTHING;\n`;

sql += `\nCOMMIT;\n`;
sql += `\n-- NOTA: doc_chunk se carga con embeddings via seed/chunks.json + script de embeddings (ver README).\n`;
fs.writeFileSync(path.join(SEED, 'load.sql'), sql);

console.log('=== Consolidación ===');
console.log('Archivos raw:', files.length);
console.log('Productos:', productos.length, '| Planes:', planes.length, '| Coberturas únicas:', cobArr.length);
console.log('Plan-cobertura:', planCob.length, '| Elegibilidad:', elegibilidad.length);
console.log('Procesos ARL:', procesos.length, '| Documentos:', documentos.length, '| Chunks RAG:', chunks.length);
console.log('Generado: seed/*.json + seed/load.sql');
