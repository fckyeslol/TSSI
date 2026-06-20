const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'seguros-sura');
const seg = JSON.parse(fs.readFileSync(path.join(OUT, 'catalogo.json'), 'utf8'));
const arl = JSON.parse(fs.readFileSync(path.join(OUT, 'catalogo-arl.json'), 'utf8'));
const abs = p => path.resolve(OUT, p).split(path.sep).join('/');
const items = [];
for (const s of seg) {
  let tipo = 'producto';
  if (['Institucional', 'Contenido'].includes(s.categoria)) tipo = 'referencia';
  items.push({
    archivo: abs(s.archivo), url: s.url,
    linea: s.categoria === 'Empresas' ? 'empresas' : (s.categoria === 'Personas' ? 'personas' : 'ref'),
    ramo: s.subcategoria, tipo,
  });
}
for (const a of arl) {
  items.push({ archivo: abs(a.archivo), url: a.url, linea: 'arl', ramo: a.subcategoria, tipo: 'proceso' });
}
fs.mkdirSync(path.join(__dirname, 'sura-db/seed/raw'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'sura-db/seed/worklist.json'), JSON.stringify(items, null, 2));
const byTipo = {};
items.forEach(i => byTipo[i.tipo] = (byTipo[i.tipo] || 0) + 1);
console.log('Total:', items.length, JSON.stringify(byTipo));
