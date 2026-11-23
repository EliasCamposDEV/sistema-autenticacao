import crypto from 'node:crypto';
import mongoose from 'mongoose';

const passwordResetTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    usedAt: {
      type: Date,
      default: null
    }
  },
  {
    collection: 'tokens_redefinicao',
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

// O MongoDB remove os documentos expirados automaticamente.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Garante no maximo um token ativo por usuario. Tokens ja usados ficam fora do indice.
passwordResetTokenSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { usedAt: null } }
);

export const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

export function generateResetToken() {
  return crypto.randomBytes(32).toString('base64url');
}
