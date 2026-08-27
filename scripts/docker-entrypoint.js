/**
 * Entrypoint Docker: asegura plantilla EX-10 y arranca el servidor.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const templatesDir = process.env.PDF_TEMPLATES_DIR
  ? path.resolve(process.env.PDF_TEMPLATES_DIR)
  : path.join(process.cwd(), 'pdf-templates');
const templatePath = path.join(templatesDir, 'EX10_template.pdf');

async function ensureTemplate() {
  if (fs.existsSync(templatePath)) return;
  console.log('[docker] Generando EX10_template.pdf de desarrollo…');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/generate-ex10-template.js'], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pdf:template exit ${code}`))));
  }).catch((err) => {
    console.warn('[docker] No se pudo generar plantilla:', err.message);
  });
}

function ensureUploadDirs() {
  for (const dir of ['uploads', 'uploads/temp', 'uploads/final']) {
    fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true });
  }
}

async function main() {
  ensureUploadDirs();
  await ensureTemplate();
  const child = spawn(process.execPath, ['src/server.js'], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((err) => {
  console.error('[docker] entrypoint', err);
  process.exit(1);
});
