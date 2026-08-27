/**
 * Nivel 2 — Definiciones de trámites (Case Engine).
 * Cada caseType declara slots documentales, checklist y plantilla PDF.
 */

const MVP_3_SLOTS = [
  {
    key: 'passport',
    type: 'passport',
    label: 'Pasaporte (página de datos biográficos)',
    clientUpload: true,
    requiresExtraction: true,
  },
  {
    key: 'proof_address',
    type: 'proof_address',
    label: 'Justificante de domicilio',
    clientUpload: true,
    requiresExtraction: false,
  },
  {
    key: 'photo',
    type: 'photo',
    label: 'Fotografía tamaño carnet',
    clientUpload: true,
    requiresExtraction: false,
  },
];

const EX10_EXTRA_SLOTS = [
  {
    key: 'fee_790',
    type: 'fee_790',
    label: 'Tasa modelo 790-052 abonada',
    clientUpload: true,
    requiresExtraction: false,
  },
  {
    key: 'empadronamiento',
    type: 'empadronamiento',
    label: 'Certificado de empadronamiento',
    clientUpload: true,
    requiresExtraction: false,
  },
  {
    key: 'criminal_record',
    type: 'criminal_record',
    label: 'Certificado de antecedentes penales',
    clientUpload: true,
    requiresExtraction: false,
  },
];

/** @type {Record<string, { id: string, label: string, description: string, pdfTemplate: string, documentSlots: typeof MVP_3_SLOTS, checklist: Array<{ id: string, label: string, kind: string }> }>} */
const CASE_TYPE_DEFINITIONS = {
  'MVP-3': {
    id: 'MVP-3',
    label: 'Recogida básica (3 documentos)',
    description: 'Pasaporte, domicilio y foto. Flujo MVP Nivel 1.',
    pdfTemplate: 'EX10_template.pdf',
    documentSlots: MVP_3_SLOTS,
    checklist: [
      { id: 'identity_extracted', label: 'Datos de identidad extraídos del pasaporte', kind: 'auto' },
      { id: 'all_docs_uploaded', label: 'Cliente ha subido todos los documentos', kind: 'auto' },
      { id: 'all_docs_approved', label: 'Despacho ha aprobado todos los documentos', kind: 'auto' },
      { id: 'case_approved', label: 'Expediente aprobado y PDF generado', kind: 'auto' },
    ],
  },
  'EX-10': {
    id: 'EX-10',
    label: 'EX-10 — Autorización de residencia temporal',
    description: 'Expediente completo EX-10: identidad, domicilio, tasa 790, empadronamiento y antecedentes.',
    pdfTemplate: 'EX10_template.pdf',
    documentSlots: [...MVP_3_SLOTS, ...EX10_EXTRA_SLOTS],
    checklist: [
      { id: 'identity_extracted', label: 'Datos de identidad extraídos del pasaporte', kind: 'auto' },
      { id: 'all_docs_uploaded', label: 'Cliente ha subido todos los documentos requeridos', kind: 'auto' },
      { id: 'all_docs_approved', label: 'Despacho ha aprobado todos los documentos', kind: 'auto' },
      { id: 'fee_790_present', label: 'Tasa 790-052 subida', kind: 'auto' },
      { id: 'empadronamiento_present', label: 'Empadronamiento subido', kind: 'auto' },
      { id: 'criminal_record_present', label: 'Antecedentes penales subidos', kind: 'auto' },
      { id: 'case_approved', label: 'Expediente aprobado y PDF EX-10 generado', kind: 'auto' },
    ],
  },
};

const DEFAULT_CASE_TYPE = 'EX-10';
const LEGACY_CASE_TYPE = 'MVP-3';

module.exports = {
  CASE_TYPE_DEFINITIONS,
  DEFAULT_CASE_TYPE,
  LEGACY_CASE_TYPE,
  MVP_3_SLOTS,
};
