const mongoose = require('mongoose');

/**
 * Expediente PathWay — colección en MongoDB: "clients" (legacy).
 * Contiene cliente, estado del trámite, datos IA y referencias de archivos (local o S3).
 */

const CLIENT_STATUSES = ['pending', 'processing', 'completed', 'action_required'];

/** Metadatos de archivo en S3 (datos IA y paths sensibles pueden cifrarse en app). */
const archivoS3Schema = new mongoose.Schema(
  {
    bucket: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    region: { type: String, default: '' },
    /** URL prefirmada o pública opcional — corta vida si es signed. */
    url: { type: String, default: '' },
    tipo: {
      type: String,
      enum: ['passport', 'dni', 'title', 'other'],
      default: 'other',
    },
    nombreOriginal: { type: String, default: '' },
    /** MIME guardado al subir (p. ej. image/jpeg) para presign / descarga. */
    contentType: { type: String, default: '', trim: true },
    /** Tamaño en bytes; opcional para auditoría. */
    tamanoBytes: { type: Number, default: null },
    subidoEn: { type: Date, default: null },
  },
  { _id: true }
);

/**
 * Campos pensados para guardar ciphertext (AES + IV en app), no texto plano.
 * Usar .select('+sensitivePayload') o getters de servicio al descifrar.
 */
const sensitiveClienteSchema = new mongoose.Schema(
  {
    /** JSON IA cifrado (base64) o documento empaquetado. */
    iaExtractedCiphertext: { type: String, default: '', select: false },
    /** Identificador de clave para rotación (p. ej. KMS). */
    encryptionKeyId: { type: String, default: '', select: false },
    /** Vector / versión de esquema de cifrado. */
    encryptionScheme: { type: String, default: 'none' },
  },
  { _id: false }
);

const clientSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      index: true,
    },

    fullName: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true },
    /** Teléfono del cliente (portal / WhatsApp); el front puede enviar phone o clientPhone. */
    phone: { type: String, default: '', trim: true },

    magicLinkToken: { type: String, required: true, unique: true, index: true },
    magicExpiresAt: { type: Date, default: null },

    /** Estado general del expediente / trámite. */
    status: {
      type: String,
      enum: CLIENT_STATUSES,
      default: 'pending',
    },
    progress: { type: Number, min: 0, max: 100, default: 0 },

    /**
     * Datos del cliente extraídos por IA (texto plano en MVP).
     * Para producción restringido: mueve a sensitiveCliente / cifra valores antes de persistir.
     */
    datosIAcliente: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    /**
     * Datos OCR del pasaporte extraídos por IA (Gemini/OpenAI) en el flujo
     * POST /api/cases/:id/upload. Texto plano (MVP); en producción cifrar.
     */
    extractedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    /** Ruta relativa en disco (final/...) o clave S3 si finalPdfOnS3 es true. */
    finalPdfPath: {
      type: String,
      default: '',
      trim: true,
    },

    /** true si finalPdfPath apunta a un objeto en S3 (URL vía presign en GET final-pdf). */
    finalPdfOnS3: {
      type: Boolean,
      default: false,
    },

    /**
     * Revisión a nivel de expediente (case-level), independiente del
     * reviewStatus por Document. La controla el abogado vía
     * PATCH /api/cases/:id/review.
     *  - pending  → recién subido por el cliente, esperando al abogado
     *  - approved → expediente OK, no se admite re-upload del cliente
     *  - rejected → el cliente debe corregir; al re-subir vuelve a pending
     */
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    /** Texto que el abogado escribe al pedir corrección (visible al cliente). */
    feedbackMessage: {
      type: String,
      default: '',
      trim: true,
    },

    /** Fecha de la última decisión del abogado (aprobado/rechazado). */
    reviewedAt: {
      type: Date,
      default: null,
    },

    sensitiveCliente: {
      type: sensitiveClienteSchema,
      default: () => ({}),
    },

    archivosS3: [archivoS3Schema],

    tramiteNotes: {
      type: String,
      default: '',
      select: false,
    },
    tramiteMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    fechaCreacionTramite: { type: Date, default: Date.now },

    /**
     * Nivel 2 — Tipo de trámite (Case Engine).
     * Valores: MVP-3 | EX-10. Expedientes legacy sin campo → MVP-3.
     */
    caseType: {
      type: String,
      default: 'EX-10',
      trim: true,
      index: true,
    },
  },
  { timestamps: true }
);

clientSchema.index({ agencyId: 1, updatedAt: -1 });

clientSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    ret.agencyId = ret.agencyId.toString();
    ret.magicToken = ret.magicLinkToken;
    if (Array.isArray(ret.archivosS3)) {
      ret.archivosS3 = ret.archivosS3.map((a) => ({
        ...a,
        id: a._id?.toString(),
        _id: undefined,
      }));
    }
  },
});

module.exports = mongoose.model('Expediente', clientSchema, 'expedientes');
module.exports.CLIENT_STATUSES = CLIENT_STATUSES;
