const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'seguros-sura');
const cat = JSON.parse(fs.readFileSync(path.join(OUT, 'catalogo.json'), 'utf8'));

// Solo productos de seguro reales para el catálogo principal
const ORDER_CAT = ['Personas', 'Empresas', 'Contenido', 'Institucional'];
const groups = {};
for (const item of cat) {
  groups[item.categoria] = groups[item.categoria] || {};
  groups[item.categoria][item.subcategoria] = groups[item.categoria][item.subcategoria] || [];
  groups[item.categoria][item.subcategoria].push(item);
}

function trunc(s, n) {
  if (!s) return '';
  s = s.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n).trim() + '…' : s;
}

let md = `# Catálogo de Seguros SURA Colombia\n\n`;
md += `> Scrapeado de https://www.sura.co/seguros — **${cat.length} páginas** procesadas.\n`;
md += `> Cada seguro tiene su página completa en \`paginas/\`. Datos estructurados en \`catalogo.json\`.\n\n`;

// resumen de conteo
const productCount = cat.filter(i => ['Personas', 'Empresas'].includes(i.categoria)).length;
md += `## Resumen\n\n`;
md += `- **Productos de seguro:** ${productCount}\n`;
md += `- **Páginas totales (incluye canales, pagos, contenido):** ${cat.length}\n\n`;

md += `| Categoría | Subcategorías | # Páginas |\n|---|---|---|\n`;
for (const c of ORDER_CAT) {
  if (!groups[c]) continue;
  const subs = Object.keys(groups[c]).sort();
  const n = subs.reduce((a, s) => a + groups[c][s].length, 0);
  md += `| **${c}** | ${subs.join(', ')} | ${n} |\n`;
}
md += `\n---\n\n`;

// índice detallado
for (const c of ORDER_CAT) {
  if (!groups[c]) continue;
  md += `## ${c}\n\n`;
  const subs = Object.keys(groups[c]).sort();
  for (const s of subs) {
    md += `### ${s}\n\n`;
    for (const item of groups[c][s]) {
      md += `#### ${item.nombre || item.titulo}\n\n`;
      if (item.descripcion) md += `${item.descripcion}\n\n`;
      md += `- 🔗 [${item.url}](${item.url})\n`;
      md += `- 📄 Página completa: [\`${item.archivo}\`](${item.archivo})\n`;
      if (item.a_quien_aseguramos) md += `- **¿A quién aseguramos?** ${trunc(item.a_quien_aseguramos, 300)}\n`;
      if (item.que_cubrimos) md += `- **¿Qué cubrimos?** ${trunc(item.que_cubrimos, 400)}\n`;
      if (item.que_no_cubrimos) md += `- **¿Qué no cubrimos?** ${trunc(item.que_no_cubrimos, 250)}\n`;
      if (item.valor_asegurado) md += `- **Valor asegurado:** ${trunc(item.valor_asegurado, 250)}\n`;
      md += `\n`;
    }
  }
  md += `---\n\n`;
}

fs.writeFileSync(path.join(OUT, 'CATALOGO.md'), md);
console.log('CATALOGO.md generado:', md.length, 'chars');

// CSV simple para uso en hojas de cálculo
let csv = 'Categoria,Subcategoria,Nombre,URL,Descripcion\n';
for (const i of cat) {
  const esc = v => '"' + String(v || '').replace(/"/g, '""').replace(/\n/g, ' ') + '"';
  csv += [i.categoria, i.subcategoria, i.nombre || i.titulo, i.url, i.descripcion].map(esc).join(',') + '\n';
}
fs.writeFileSync(path.join(OUT, 'seguros.csv'), csv);
console.log('seguros.csv generado');
