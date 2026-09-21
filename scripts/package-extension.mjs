import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

async function packageExtension() {
  const zip = new JSZip();
  const extDir = path.resolve(process.cwd(), 'extension');
  const targetZipPath = path.resolve(process.cwd(), 'public', 'cfo-extensao-cbmerj.zip');

  function addDirectory(dirPath, folderNode) {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        addDirectory(fullPath, folderNode ? folderNode.folder(item) : zip.folder(item));
      } else {
        const content = fs.readFileSync(fullPath);
        if (folderNode) {
          folderNode.file(item, content);
        } else {
          zip.file(item, content);
        }
      }
    }
  }

  console.log('[Package Extension] Compactando extensão a partir de:', extDir);
  addDirectory(extDir);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const publicDir = path.dirname(targetZipPath);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(targetZipPath, buffer);
  console.log(`[Package Extension] Sucesso: ${targetZipPath} gerado com ${buffer.length} bytes.`);
}

packageExtension().catch((err) => {
  console.error('[Package Extension] Falha ao empacotar extensão:', err);
  process.exit(1);
});
