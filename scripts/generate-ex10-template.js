/**
 * Genera pdf-templates/EX10_template.pdf (placeholder para desarrollo).
 * Sustituye por el PDF oficial del ministerio en producción.
 */

const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { config } = require('../src/config');
const { STAMP_COORDS } = require('../src/lib/pdf/stampExpedientePdf');

async function main() {
  const dir = config.pdfTemplatesDir;
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, 'EX10_template.pdf');

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText('EX-10 — Plantilla de desarrollo PathWay', {
    x: 50,
    y: 800,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('Reemplaza este archivo por el modelo oficial de extranjería.', {
    x: 50,
    y: 780,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  for (const [key, coords] of Object.entries(STAMP_COORDS)) {
    page.drawText(`${key}:`, {
      x: 50,
      y: coords.y,
      size: 10,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  const bytes = await pdf.save();
  await fs.writeFile(outPath, bytes);
  console.log(`Plantilla generada: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
