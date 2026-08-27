/**
 * Progreso documental del expediente (% slots con archivo).
 */

/**
 * @param {import('mongoose').Document} doc
 * @param {import('mongoose').Document|null|undefined} client
 */
function documentHasFile(doc, client) {
  const key = doc.key || doc.type || '';
  if (key === 'passport' && (client?.extractedData || doc.extractedData)) return true;
  return Boolean(doc.fileUrl && String(doc.fileUrl).trim());
}

/**
 * @param {import('mongoose').Document[]} documents
 * @param {import('mongoose').Document|null|undefined} client
 */
function computeCaseProgress(documents, client) {
  if (!documents?.length) return 0;
  const withFile = documents.filter((d) => documentHasFile(d, client)).length;
  return Math.round((withFile / documents.length) * 100);
}

module.exports = { documentHasFile, computeCaseProgress };
