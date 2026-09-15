const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const COSTO_HASH = 10;

const usuarioSchema = new mongoose.Schema({
  nombre:        { type: String, required: true, trim: true, maxlength: 80 },
  email:         { type: String, required: true, unique: true, lowercase: true, trim: true,
                   match: [/^[\w.+-]+@[\w-]+\.[\w.-]+$/, 'Formato de correo no valido'] },
  password_hash: { type: String, required: true, select: false },
  rol:           { type: String, required: true, enum: ['Administrador', 'Operador'], default: 'Operador' },
  estado:        { type: Boolean, default: true },
  intentos_fallidos:      { type: Number, default: 0 },
  bloqueado_hasta:        { type: Date, default: null },
  token_recuperacion:     { type: String, default: null, select: false },
  token_recuperacion_exp: { type: Date, default: null, select: false }
}, { timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' }, collection: 'usuarios' });

usuarioSchema.index({ rol: 1, estado: 1 });

usuarioSchema.statics.hashear = function (clave) {
  return bcrypt.hash(clave, COSTO_HASH);
};

usuarioSchema.methods.verificarClave = function (clave) {
  return bcrypt.compare(clave, this.password_hash);
};

module.exports = mongoose.model('Usuario', usuarioSchema);
