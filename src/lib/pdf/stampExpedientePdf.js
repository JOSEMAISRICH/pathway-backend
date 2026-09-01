/**
 * stampExpedientePdf.js
 * ---------------------------------------------------------------------------
 * Genera el PDF final del expediente "estampando" los datos extraídos por la
 * IA sobre la plantilla EX10_template.pdf usando pdf-lib.
 *
 * Estrategia:
 *  - Si la plantilla es un AcroForm (PDF rellenable), se intentan rellenar
 *    los campos por nombre.
 *  - Si la plantilla no tiene formulario, los datos se dibujan ("estampan")
 *    con `drawText` sobre coordenadas configurables.
 *
 * Salida local: <UPLOAD_DIR>/final/expediente_[caseId].pdf
 * Con S3 configurado (S3_BUCKET + región): sube el PDF y devuelve objectKey.
 */

const fs = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { config } = require('../../config');
const { isS3Configured, uploadPdfObject, buildFinalPdfObjectKey } = require('../s3Storage');

const TEMPLATE_FILE = 'EX10_template.pdf';

/** Mapeo dato → nombre del campo AcroForm en la plantilla (si lo tuviera). */
const ACROFORM_FIELDS = {
  nombre: 'nombre',
  apellidos: 'apellidos',
  numero_pasaporte: 'numero_pasaporte',
  nacionalidad: 'nacionalidad',
  fecha_nacimiento: 'fecha_nacimiento',
  fecha_caducidad: 'fecha_caducidad',
  genero: 'genero',
  alerta: 'alerta',
};

/**
 * Coordenadas por defecto para el modo "estampado" (PDF sin formulario).
 * Ajusta x/y al diseño real de la plantilla EX-10. El origen (0,0) está en
 * la esquina inferior izquierda de cada página.
 */
const STAMP_COORDS = {
  nombre: { page: 0, x: 150, y: 700, size: 11 },
  apellidos: { page: 0, x: 150, y: 670, size: 11 },
  numero_pasaporte: { page: 0, x: 150, y: 640, size: 11 },
  nacionalidad: { page: 0, x: 150, y: 610, size: 11 },
  fecha_nacimiento: { page: 0, x: 150, y: 580, size: 11 },
  fecha_caducidad: { page: 0, x: 150, y: 550, size: 11 },
  genero: { page: 0, x: 150, y: 520, size: 11 },
  alerta: { page: 0, x: 150, y: 480, size: 12 },
};

function safeText(value) {
  if (value == null) return '';
  return String(value);
}

function finalDir() {
  return path.resolve(config.uploadDir, 'final');
}

async function ensureFinalDir() {
  const dir = finalDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function readTemplate() {
  const templatePath = path.join(config.pdfTemplatesDir, TEMPLATE_FILE);
  try {
    return await fs.readFile(templatePath);
  } catch (e) {
    const err = new Error(
      `No se encuentra la plantilla ${TEMPLATE_FILE} en ${config.pdfTemplatesDir}`
    );
    err.statusCode = 500;
    err.cause = e;
    throw err;
  }
}

function flatForStamp(extractedData) {
  const data =
    extractedData && typeof extractedData === 'object' ? { ...extractedData } : {};
  if (!data.fecha_caducidad && data.fecha_caducidad_pasaporte) {
    data.fecha_caducidad = data.fecha_caducidad_pasaporte;
  }
  if (!data.genero && data.sexo) {
    data.genero = data.sexo;
  }
  return data;
}

function tryFillAcroForm(pdfDoc, extractedData) {
  const data = flatForStamp(extractedData);
  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    return false;
  }
  if (!form || form.getFields().length === 0) return false;

  let didFillAny = false;
  for (const [dataKey, fieldName] of Object.entries(ACROFORM_FIELDS)) {
    const v = safeText(extractedData[dataKey]);
    if (!v) continue;
    try {
      form.getTextField(fieldName).setText(v);
      didFillAny = true;
    } catch {
      /* el campo no existe en este PDF; lo ignoramos */
    }
  }
  return didFillAny;
}

async function stampWithCoordinates(pdfDoc, extractedData) {
  const data = flatForStamp(extractedData);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return;

  for (const [dataKey, coords] of Object.entries(STAMP_COORDS)) {
    const v = safeText(data[dataKey]);
    if (!v) continue;
    const page = pages[coords.page] || pages[0];
    const isAlerta = dataKey === 'alerta';
    page.drawText(v, {
      x: coords.x,
      y: coords.y,
      size: coords.size || 11,
      font: isAlerta ? fontBold : font,
      color: isAlerta ? rgb(0.85, 0.1, 0.1) : rgb(0, 0, 0),
    });
  }
}

/**
 * Genera el PDF en memoria (plantilla + datos).
 * @returns {Promise<{ buffer: Buffer, fileName: string, relativePath: string }>}
 */
async function buildStampedExpedientePdf(caseId, extractedData) {
  if (!caseId) {
    throw Object.assign(new Error('Falta caseId para nombrar el PDF'), { statusCode: 400 });
  }
  const data = extractedData && typeof extractedData === 'object' ? extractedData : {};

  const templateBytes = await readTemplate();
  const pdfDoc = await PDFDocument.load(templateBytes);

  const filledViaForm = tryFillAcroForm(pdfDoc, data);
  if (!filledViaForm) {
    await stampWithCoordinates(pdfDoc, data);
  }

  const safeId = String(caseId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `expediente_${safeId}.pdf`;
  const bytes = await pdfDoc.save();
  const buffer = Buffer.from(bytes);
  const relativePath = path.posix.join('final', fileName);
  return { buffer, fileName, relativePath };
}

/**
 * Estampa los datos sobre la plantilla y guarda el PDF (disco o S3).
 *
 * @param {string} caseId ID del expediente en MongoDB.
 * @param {Object} extractedData JSON normalizado del extractor.
 * @returns {Promise<{ fileName: string, relativePath: string, absolutePath: string, storage: 'local'|'s3', objectKey?: string }>}
 */
async function stampExpedientePdf(caseId, extractedData) {
  const { buffer, fileName, relativePath } = await buildStampedExpedientePdf(caseId, extractedData);

  if (isS3Configured()) {
    const objectKey = buildFinalPdfObjectKey(fileName);
    await uploadPdfObject(objectKey, buffer);
    return {
      fileName,
      relativePath,
      absolutePath: '',
      storage: 's3',
      objectKey,
    };
  }

  const outDir = await ensureFinalDir();
  const absolutePath = path.join(outDir, fileName);
  await fs.writeFile(absolutePath, buffer);
  return {
    fileName,
    relativePath,
    absolutePath,
    storage: 'local',
  };
}

module.exports = {
  stampExpedientePdf,
  buildStampedExpedientePdf,
  TEMPLATE_FILE,
  STAMP_COORDS,
  ACROFORM_FIELDS,
};
