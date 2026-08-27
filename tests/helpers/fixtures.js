/**
 * Fixtures binarios autogenerados para tests.
 *  - tinyPng:   PNG 1x1 transparente válido (8 + 5 chunks = ~67 bytes).
 *  - tinyPdf:   PDF mínimo creado al vuelo con pdf-lib.
 *
 * Se generan al cargar el módulo y se cachean para no rehacerlos por test.
 */

const { PDFDocument } = require('pdf-lib');

const TINY_PNG_HEX =
  '89504e470d0a1a0a' + // signature
  '0000000d49484452' + // IHDR length + name
  '00000001000000010806000000' + // 1x1, RGBA, no filter
  '1f15c489' + // CRC for IHDR
  '0000000a49444154' + // IDAT length + name
  '789c6300010000000500010d0a2db4' + // deflate stream
  '0000000049454e44' + // IEND length + name
  'ae426082';
const tinyPng = Buffer.from(TINY_PNG_HEX, 'hex');

let tinyPdfCache;
async function tinyPdf() {
  if (tinyPdfCache) return tinyPdfCache;
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  tinyPdfCache = Buffer.from(await doc.save());
  return tinyPdfCache;
}

module.exports = { tinyPng, tinyPdf };
