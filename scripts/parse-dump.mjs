import fs from 'node:fs';

const tocPath = 'C:/Users/renas/Downloads/2026-10-10T04_23Z/cfo_app_dev/toc.dat';
const toc = fs.readFileSync(tocPath);
const str = toc.toString('latin1');

const regex = /COPY\s+"public"\."([^"]+)"\s*\(([^)]+)\)\s*FROM\s*stdin;[\s\S]{1,200}?(\d{4}\.dat)/g;
let m;
const map = [];
while ((m = regex.exec(str)) !== null) {
  map.push({ table: m[1], columns: m[2], file: m[3] });
}

console.log(`Encontradas ${map.length} tabelas no dump:`);
for (const item of map) {
  console.log(`- ${item.table} (${item.file})`);
}

fs.writeFileSync('scripts/dump-tables.json', JSON.stringify(map, null, 2));
