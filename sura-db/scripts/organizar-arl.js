const fs = require('fs');
const path = require('path');
const FC = path.join(__dirname, '.firecrawl');
const OUT = path.join(__dirname, 'seguros-sura');
const PAGES = path.join(OUT, 'paginas-arl');
fs.mkdirSync(PAGES, { recursive: true });

const map = JSON.parse(fs.readFileSync(path.join(FC, 'arl-urls.json'), 'utf8'));
const meta = {};
for (const l of map.data.links) meta[l.url.replace(/\/$/, '')] = { title: l.title, description: l.description };

function fileToUrl(f) {
  return 'https://www.sura.co/' + f.replace(/\.md$/, '').replace(/^sura\.co-/, '').replace(/-/g, '/');
}
function clean(md) {
  let lines = md.split('\n');
  let start = lines.findIndex(l => /^#{1,3}\s+\S/.test(l) && !/Skip to main|accessibility/i.test(l));
  if (start > 0) lines = lines.slice(start);
  const footer = [/^\[Líneas de atención\]/i, /^-?\s*\[GRUPO SURA\]/i, /^@Copyright SURA/i, /chattigo-widget/i];
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) if (footer.some(re => re.test(lines[i].trim()))) { end = i; break; }
  return lines.slice(0, end).filter(l => !/userway\.org|cdn\.userway|Spinner:/i.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').replace(/^(\s*\* \* \*\s*\n)+/g, '').trim();
}
function firstHeading(md) { const m = md.match(/^#{1,3}\s+(.+)$/m); return m ? m[1].trim() : null; }
function categorize(url) {
  const u = url.replace('https://www.sura.co/arl', '');
  if (/^\/afiliacion/.test(u)) return 'Afiliación';
  if (/^\/certificados/.test(u)) return 'Certificados';
  if (/^\/tramites/.test(u)) return 'Trámites';
  if (/^\/accidente-de-trabajo/.test(u)) return 'Accidente de trabajo';
  if (/^\/gestion-financiera/.test(u)) return 'Gestión financiera';
  if (/^\/sst/.test(u)) return 'SST (Seguridad y Salud en el Trabajo)';
  if (/^\/educacion/.test(u)) return 'Educación';
  if (/^\/centro-de-ayuda/.test(u)) return 'Centro de ayuda';
  return 'General ARL';
}

const files = fs.readdirSync(FC).filter(f => /^sura\.co-arl.*\.md$/.test(f));
const catalog = [];
for (const f of files) {
  const cleaned = clean(fs.readFileSync(path.join(FC, f), 'utf8'));
  const url = fileToUrl(f);
  const m = meta[url] || {};
  const sub = categorize(url);
  const outName = f.replace(/^sura\.co-/, '').replace(/-/g, '/').replace(/\//g, '-');
  const header = `# ${m.title || firstHeading(cleaned) || f}\n\n- **URL:** ${url}\n- **Línea:** ARL (Riesgos Laborales) › ${sub}\n${m.description ? `- **Descripción:** ${m.description}\n` : ''}\n---\n\n`;
  fs.writeFileSync(path.join(PAGES, outName), header + cleaned);
  catalog.push({
    titulo: m.title || firstHeading(cleaned) || f, nombre: firstHeading(cleaned) || m.title,
    url, linea: 'ARL', categoria: 'ARL', subcategoria: sub, descripcion: m.description || null,
    archivo: 'paginas-arl/' + outName, palabras: cleaned.split(/\s+/).length,
  });
}
catalog.sort((a, b) => (a.subcategoria + a.titulo).localeCompare(b.subcategoria + b.titulo));
fs.writeFileSync(path.join(OUT, 'catalogo-arl.json'), JSON.stringify(catalog, null, 2));
console.log('ARL procesados:', catalog.length);
