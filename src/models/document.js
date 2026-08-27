const mongoose = require('mongoose');

const DOCUMENT_TYPES = [
  'passport',
  'proof_address',
  'photo',
  'dni',
  'title',
  'fee_790',
  'empadronamiento',
  'criminal_record',
  'other',
];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

const documentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expediente',
      required: true,
      index: true,
    },
    /** Clave estable para el front (passport, proof_address, photo, …). */
    key: { type: String, default: '', trim: true, index: true },
    type: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    label: { type: String, default: '', trim: true },
    /** Ruta local legacy o URI de objeto. */
    fileUrl: { type: String, default: '' },

    /** S3 (preferir key+bucket sobre URL persistente si es prefirmada). */
    s3Bucket: { type: String, default: '', trim: true },
    s3Key: { type: String, default: '', trim: true },
    s3Region: { type: String, default: '' },

    /** pending_upload | uploaded | processing | processed | requires_review | error */
    ingestionStatus: { type: String, default: 'pending_upload', trim: true },
    /** Extracción IA ExtractedData v1.0 o legacy plano. */
    extractedData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    extractedDataCiphertext: {
      type: String,
      default: '',
      select: false,
    },
    encryptionKeyId: { type: String, default: '', select: false },

    reviewStatus: {
      type: String,
      enum: REVIEW_STATUSES,
      default: 'pending',
    },
    feedbackMessage: { type: String, default: '' },
    originalName: { type: String, default: '' },
    uploadedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

documentSchema.index({ clientId: 1, createdAt: 1 });
documentSchema.index({ clientId: 1, key: 1 }, { unique: true, sparse: true });

documentSchema.post('save', async function postSaveDoc() {
  const { syncClientProgress } = require('../lib/syncClient');
  await syncClientProgress(this.clientId);
});

documentSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    ret.clientId = ret.clientId.toString();
    ret.status = ret.reviewStatus;
    delete ret.reviewStatus;
    if (!ret.key) ret.key = ret.type;
  },
});

module.exports = mongoose.model('Document', documentSchema);
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.REVIEW_STATUSES = REVIEW_STATUSES;
