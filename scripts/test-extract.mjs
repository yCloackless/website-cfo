import fs from 'node:fs';

const toc = fs.readFileSync('C:/Users/renas/Downloads/2026-10-10T04_23Z/cfo_app_dev/toc.dat', 'utf-8');
const regex = /CREATE TABLE "public"\."([^"]+)"\s*\([^;]+;/gi;
let m;
while ((m = regex.exec(toc)) !== null) {
  if (m[1] === 'exam_questions') {
    console.log(m[0]);
  }
}
