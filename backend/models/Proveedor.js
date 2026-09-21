const mongoose = require('mongoose');

const proveedorSchema = new mongoose.Schema({
  razon_social:    { type: String, required: true, trim: true, maxlength: 120 },
  rut_empresa:     { type: String, required: true, unique: true, trim: true,
                     match: [/^\d{7,8}-[\dkK]$/, 'RUT no valido (formato 76543210-9)'] },
  contacto:        { type: String, trim: true, default: '' },
  email_contacto:  { type: String, lowercase: true, trim: true, default: '' },
  nivel_confianza: { type: Number, min: 1, max: 5, default: 3 },
  activo:          { type: Boolean, default: true }
}, { timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' }, collection: 'proveedores' });

proveedorSchema.index({ razon_social: 1 });

module.exports = mongoose.model('Proveedor', proveedorSchema);
