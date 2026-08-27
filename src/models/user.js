const mongoose = require('mongoose');

/**
 * Usuario humano vinculable a una o varias agencias (equipo).
 * El login “dueño legacy” puede seguir en Agency; estos usuarios sirven para multi-miembro.
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, select: false },
    nombre: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '' },
    ultimoLoginEn: { type: Date, default: null },
  },
  { timestamps: true }
);

// `unique: true` en `email` ya crea el índice; no duplicar con schema.index().

userSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.passwordHash;
  },
});

module.exports = mongoose.model('User', userSchema);
