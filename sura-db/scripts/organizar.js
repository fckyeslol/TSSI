const fs = require('fs');
const path = require('path');

const FC = path.join(__dirname, '.firecrawl');
const OUT = path.join(__dirname, 'seguros-sura');
const PAGES = path.join(OUT, 'paginas');
fs.mkdirSync(PAGES, { recursive: true });

// --- metadata (title/description) desde el map original ---
const map = JSON.parse(fs.readFileSync(path.join(FC, 'urls.json'), 'utf8'));
const meta = {};
for (const l of map.data.links) meta[l.url.replace(/\/$/, '')] = { title: l.title, description: l.description };

// filename <-> url: el CLI nombra archivos como sura.co-seguros-...md
function fileToUrl(f) {
  const base = f.replace(/\.md$/, '');
  // sura.co-seguros-personas-salud-poliza-clasica -> https://www.sura.co/seguros/personas/salud/poliza/clasica
  const rest = base.replace(/^sura\.co-/, '');
  return 'https://www.sura.co/' + rest.replace(/-/g, '/');
}

// --- limpieza de boilerplate ---
function clean(md) {
  let lines = md.split('\n');
  // 1. quitar cabecera accesibilidad: hasta la primera linea "## " o "# "
  let start = lines.findIndex(l => /^#{1,3}\s+\S/.test(l) && !/Skip to main|accessibility/i.test(l));
  if (start > 0) lines = lines.slice(start);
  // 2. quitar footer: desde marcadores conocidos
  const footerMarkers = [
    /^\[Líneas de atención\]/i,
    /^-?\s*\[GRUPO SURA\]/i,
    /^@Copyright SURA/i,
    /chattigo-widget/i,
  ];
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (footerMarkers.some(re => re.test(lines[i].trim()))) { end = i; break; }
  }
  lines = lines.slice(0, end);
  // 3. quitar bloques de imagenes sueltas de spinner/widget y lineas vacias repetidas
  let out = lines
    .filter(l => !/userway\.org|cdn\.userway|Spinner:/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^(\s*\* \* \*\s*\n)+/g, '')
    .trim();
  return out;
}

// --- extraer secciones clave ---
function section(md, headingRe) {
  const lines = md.split('\n');
  const idx = lines.findIndex(l => headingRe.test(l));
  if (idx === -1) return null;
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^#{1,3}\s/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim() || null;
}

// --- categorización ---
function categorize(url) {
  const u = url.replace('https://www.sura.co/seguros', '');
  if (/^\/personas\/salud/.test(u)) return ['Personas', 'Salud'];
  if (/^\/personas\/vida/.test(u)) return ['Personas', 'Vida'];
  if (/^\/personas\/hogar/.test(u)) return ['Personas', 'Hogar y Vivienda'];
  if (/^\/personas\/movilidad/.test(u)) return ['Personas', 'Movilidad'];
  if (/^\/personas\/responsabilidad-civil/.test(u)) return ['Personas', 'Responsabilidad Civil'];
  if (/^\/personas/.test(u)) return ['Personas', 'Otros'];
  if (/^\/empresas\/responsabilidad-civil/.test(u)) return ['Empresas', 'Responsabilidad Civil'];
  if (/^\/empresas\/cumplimiento/.test(u)) return ['Empresas', 'Cumplimiento'];
  if (/^\/empresas\/transporte/.test(u)) return ['Empresas', 'Transporte'];
  if (/^\/empresas\/construccion/.test(u)) return ['Empresas', 'Construcción'];
  if (/^\/empresas\/agro/.test(u)) return ['Empresas', 'Agro'];
  if (/^\/empresas\/energia/.test(u)) return ['Empresas', 'Energía'];
  if (/^\/empresas\/colectivos/.test(u)) return ['Empresas', 'Colectivos'];
  if (/^\/empresas\/corporativos-pymes/.test(u)) return ['Empresas', 'Corporativos y PYMES'];
  if (/^\/empresas\/sectores/.test(u)) return ['Empresas', 'Sectores'];
  if (/^\/empresas/.test(u)) return ['Empresas', 'Otros'];
  if (/^\/colectivos/.test(u)) return ['Empresas', 'Colectivos'];
  if (/^\/movilidad-segura/.test(u)) return ['Contenido', 'Movilidad Segura'];
  if (/^\/canales-venta/.test(u)) return ['Institucional', 'Canales de venta'];
  if (/^\/medios-pago/.test(u)) return ['Institucional', 'Medios de pago'];
  if (/^\/centro-de-ayuda/.test(u)) return ['Institucional', 'Centro de ayuda'];
  return ['Institucional', 'General'];
}

// --- titulo limpio desde primer heading ---
function firstHeading(md) {
  const m = md.match(/^#{1,3}\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

// --- procesar todos ---
const files = fs.readdirSync(FC).filter(f => f.endsWith('.md'));
const catalog = [];

for (const f of files) {
  const raw = fs.readFileSync(path.join(FC, f), 'utf8');
  const cleaned = clean(raw);
  const url = fileToUrl(f);
  const m = meta[url] || meta[url.replace(/\/$/, '')] || {};
  const [cat, sub] = categorize(url);
  const heading = firstHeading(cleaned);
  const slug = f.replace(/^sura\.co-seguros-?/, '').replace(/\.md$/, '') || 'index';

  // guardar pagina limpia
  const outName = slug.replace(/\//g, '-') + '.md';
  const header = `# ${m.title || heading || slug}\n\n- **URL:** ${url}\n- **Categoría:** ${cat} › ${sub}\n${m.description ? `- **Descripción:** ${m.description}\n` : ''}\n---\n\n`;
  fs.writeFileSync(path.join(PAGES, outName), header + cleaned);

  catalog.push({
    titulo: m.title || heading || slug,
    nombre: heading || m.title,
    url,
    categoria: cat,
    subcategoria: sub,
    descripcion: m.description || null,
    que_cubrimos: section(cleaned, /¿Qué cubrimos/i),
    a_quien_aseguramos: section(cleaned, /¿A quién aseguramos/i),
    que_no_cubrimos: section(cleaned, /¿Qué no cubrimos/i),
    valor_asegurado: section(cleaned, /valor asegurado/i),
    archivo: 'paginas/' + outName,
    palabras: cleaned.split(/\s+/).length,
  });
}

catalog.sort((a, b) => (a.categoria + a.subcategoria + a.titulo).localeCompare(b.categoria + b.subcategoria + b.titulo));
fs.writeFileSync(path.join(OUT, 'catalogo.json'), JSON.stringify(catalog, null, 2));
console.log('Procesados:', catalog.length, 'archivos limpios en seguros-sura/paginas/');
console.log('JSON:', path.join(OUT, 'catalogo.json'));
