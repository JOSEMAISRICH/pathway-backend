const mongoose = require('mongoose');
require('./user');

/** Datos de facturación Stripe (IDs sensibles con select: false por defecto). */
const stripeSubscriptionSchema = new mongoose.Schema(
  {
    customerId: {
      type: String,
      default: '',
      trim: true,
      select: false,
    },
    subscriptionId: { type: String, default: '', trim: true },
    priceId: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: [
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused',
        '',
      ],
      default: '',
    },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { _id: false }
);

/** Legacy / precios mostrados en producto sin Stripe conectado. */
const billingPlanSchema = new mongoose.Schema(
  {
    plan: { type: String, default: 'standard' },
    priceMonthly: { type: Number, default: 75 },
    currency: { type: String, default: 'EUR' },
  },
  { _id: false }
);

const teamMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member',
    },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const agencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    /** Hash bcrypt — nunca exponer en JSON (select: false). */
    passwordHash: { type: String, required: true, select: false },

    /** Recuperación de contraseña (POST /api/auth/forgot-password). */
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpiresAt: { type: Date, default: null, select: false },

    logoUrl: { type: String, default: '' },

    /** Stripe como fuente de verdad cuando exista subscriptionId. */
    stripe: {
      type: stripeSubscriptionSchema,
      default: () => ({}),
    },
    billing: {
      type: billingPlanSchema,
      default: () => ({}),
    },

    /** Equipo adicional (usuarios colección User). Dueño puede ser el email de esta agencia. */
    members: [teamMemberSchema],

    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },

    /** Indica versión/clave KMS para cuando cifréis campos en esta agencia. */
    encryptionKeyId: { type: String, default: '', select: false },
  },
  { timestamps: true }
);

agencySchema.index({ 'stripe.subscriptionId': 1 }, { sparse: true });
agencySchema.index({ 'members.userId': 1 });

agencySchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.passwordHash;
    if (Array.isArray(ret.members)) {
      ret.members = ret.members.map((m) => ({
        ...m,
        id: m._id?.toString(),
        userId: m.userId?.toString(),
        _id: undefined,
      }));
    }
  },
});

module.exports = mongoose.model('Agency', agencySchema);
