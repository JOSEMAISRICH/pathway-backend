/**
 * Genera pdf-templates/EX10_template.pdf (plantilla base del TFG).
 * Para producción real: sustituir por el PDF oficial EX-10 de extranjería en pdf-templates/.
 */

const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { config } = require('../src/config');
const { STAMP_COORDS } = require('../src/lib/pdf/stampExpedientePdf');

const FIELD_LABELS = {
  nombre: 'Nombre',
  apellidos: 'Apellidos',
  numero_pasaporte: 'N.º pasaporte',
  nacionalidad: 'Nacionalidad',
  fecha_nacimiento: 'Fecha de nacimiento',
  fecha_caducidad: 'Caducidad del pasaporte',
  genero: 'Sexo',
  alerta: 'Observaciones',
};

async function main() {
  const dir = config.pdfTemplatesDir;
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, 'EX10_template.pdf');

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText('EX-10 — Resumen de datos del solicitante', {
    x: 50,
    y: 800,
    size: 14,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawText('Documento generado por PathWay a partir de la documentación aportada.', {
    x: 50,
    y: 780,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  for (const [key, coords] of Object.entries(STAMP_COORDS)) {
    page.drawText(`${FIELD_LABELS[key] || key}:`, {
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
