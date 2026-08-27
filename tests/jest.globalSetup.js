/**
 * globalSetup: corre UNA vez antes de la suite.
 *  - Levanta mongodb-memory-server.
 *  - Crea el árbol .tmp/uploads y .tmp/pdf-templates.
 *  - Genera un EX10_template.pdf fake con pdf-lib (AcroForm con los campos
 *    que estampa el pipeline) para que las pruebas sean autocontenidas.
 *  - Escribe la URI de mongo en .tmp/mongo-uri.txt y en process.env para que
 *    el setupFile de cada worker la lea (--runInBand basta para que persista).
 */

const fs = require('fs/promises');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const TMP_ROOT = path.join(__dirname, '.tmp');
const UPLOAD_DIR = path.join(TMP_ROOT, 'uploads');
const PDF_DIR = path.join(TMP_ROOT, 'pdf-templates');
const URI_FILE = path.join(TMP_ROOT, 'mongo-uri.txt');

async function buildFakeEx10Template() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  page.drawText('EX-10 (fake template)', { x: 50, y: 800, size: 14, font });
  const form = pdfDoc.getForm();
  const fields = [
    'nombre',
    'apellidos',
    'numero_pasaporte',
    'nacionalidad',
    'fecha_nacimiento',
    'fecha_caducidad',
    'genero',
    'alerta',
  ];
  let y = 750;
  for (const name of fields) {
    page.drawText(`${name}:`, { x: 50, y, size: 10, font });
    const tf = form.createTextField(name);
    tf.addToPage(page, { x: 160, y: y - 4, width: 380, height: 18 });
    y -= 28;
  }
  return Buffer.from(await pdfDoc.save());
}

module.exports = async () => {
  await fs.mkdir(TMP_ROOT, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(PDF_DIR, { recursive: true });

  const ex10Bytes = await buildFakeEx10Template();
  await fs.writeFile(path.join(PDF_DIR, 'EX10_template.pdf'), ex10Bytes);

  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await fs.writeFile(URI_FILE, uri, 'utf8');
  process.env.MONGODB_URI = uri;
  process.env.UPLOAD_DIR = UPLOAD_DIR;
  process.env.PDF_TEMPLATES_DIR = PDF_DIR;

  globalThis.__MONGOD__ = mongod;
};
