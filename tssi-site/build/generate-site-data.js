// Genera tssi-site/data/catalogo.json desde los seed de sura-db, genericado para TSSI.
const fs = require('fs'), path = require('path');
const SEED = path.resolve(__dirname, '..', '..', 'sura-db', 'seed');
const OUT = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(OUT, { recursive: true });

const J = f => JSON.parse(fs.readFileSync(path.join(SEED, f), 'utf8'));
const productos = J('productos.json');
const planCob = J('plan_coberturas.json');
const elegib = J('elegibilidad.json');
const procesos = J('procesos.json');

// quitar marca SURA -> TSSI / neutral
const debrand = s => !s ? s : s
  .replace(/Seguros\s+SURA/gi, 'TSSI')
  .replace(/\bSURA\b/g, 'TSSI')
  .replace(/\s+–\s+Flypass\s+2026/gi, '')
  .replace(/\s+2026/g, '')
  .replace(/\s{2,}/g, ' ').trim();

// coberturas por producto
const cobByProd = {};
for (const pc of planCob) {
  (cobByProd[pc.producto_slug] ||= { incluida: new Set(), opcional: new Set(), excluida: new Set() });
  const nombre = pc.cobertura_slug; // se reemplaza abajo por nombre legible
  cobByProd[pc.producto_slug][pc.tipo]?.add(JSON.stringify({ slug: pc.cobertura_slug, limite: pc.limite || null }));
}
// mapa slug->nombre cobertura
const cobNombre = {};
for (const c of J('coberturas.json')) cobNombre[c.slug] = c.nombre;
const elegByProd = {};
for (const e of elegib) elegByProd[e.producto_slug] = e;

const RAMO_LABEL = {
  'personas-salud': 'Salud', 'personas-vida': 'Vida', 'personas-hogar-y-vivienda': 'Hogar y Vivienda',
  'personas-movilidad': 'Movilidad', 'personas-otros': 'Otros', 'personas-responsabilidad-civil': 'Responsabilidad Civil',
  'empresas-responsabilidad-civil': 'Responsabilidad Civil', 'empresas-cumplimiento': 'Cumplimiento',
  'empresas-transporte': 'Transporte', 'empresas-construccion': 'Construcción', 'empresas-agro': 'Agro',
  'empresas-energia': 'Energía', 'empresas-colectivos': 'Colectivos', 'empresas-corporativos-y-pymes': 'Corporativos y PYMES',
  'empresas-sectores': 'Sectores', 'empresas-otros': 'Otros',
};

const outProd = productos.map(p => {
  const c = cobByProd[p.slug] || { incluida: new Set(), opcional: new Set(), excluida: new Set() };
  const toArr = set => [...set].map(s => { const o = JSON.parse(s); return { nombre: cobNombre[o.slug] || o.slug, limite: o.limite }; });
  const ramoSlug = `${p.linea}-${(p.ramo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  const e = elegByProd[p.slug];
  return {
    slug: p.slug, nombre: debrand(p.nombre), linea: p.linea, ramo: p.ramo,
    ramoId: ramoSlug, resumen: debrand(p.resumen), descripcion: debrand(p.descripcion),
    tipo_persona: p.tipo_persona, es_digital: !!p.es_digital,
    coberturas: { incluidas: toArr(c.incluida), opcionales: toArr(c.opcional), excluidas: toArr(c.excluida) },
    elegibilidad: e ? { descripcion: debrand(e.descripcion), edad_min: e.edad_min, edad_max: e.edad_max } : null,
  };
}).filter(p => p.linea === 'personas' || p.linea === 'empresas');

const outProc = procesos.map(p => ({
  slug: p.slug, nombre: debrand(p.nombre), tipo: p.tipo, dirigido_a: p.dirigido_a,
  descripcion: debrand(p.descripcion), pasos: (p.pasos || []).map(x => ({ ...x, titulo: debrand(x.titulo), detalle: debrand(x.detalle) })),
}));

// arbol de lineas/ramos
function buildRamos(linea) {
  const map = {};
  for (const p of outProd.filter(x => x.linea === linea)) {
    (map[p.ramoId] ||= { id: p.ramoId, nombre: RAMO_LABEL[p.ramoId] || p.ramo, productos: [] }).productos.push(p.slug);
  }
  return Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

const data = {
  generado: 'TSSI catalogo',
  lineas: [
    { id: 'personas', nombre: 'Personas', ramos: buildRamos('personas') },
    { id: 'empresas', nombre: 'Empresas', ramos: buildRamos('empresas') },
    { id: 'arl', nombre: 'ARL · Riesgos Laborales', procesos: outProc.map(p => p.slug) },
  ],
  productos: outProd,
  procesos: outProc,
};
fs.writeFileSync(path.join(OUT, 'catalogo.json'), JSON.stringify(data, null, 2));
console.log('catalogo.json:', outProd.length, 'productos,', outProc.length, 'procesos ARL');
console.log('Personas ramos:', buildRamos('personas').length, '| Empresas ramos:', buildRamos('empresas').length);
