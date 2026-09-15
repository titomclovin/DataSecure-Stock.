const mongoose = require('mongoose');

const alertaSchema = new mongoose.Schema({
  tipo_amenaza:    { type: String, required: true },
  severidad:       { type: String, required: true, enum: ['Baja', 'Media', 'Alta', 'Critica'] },
  descripcion:     { type: String, required: true },
  ip_origen:       { type: String, default: '' },
  id_usuario:      { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  evidencia:       { type: mongoose.Schema.Types.Mixed, default: {} },
  resuelta:        { type: Boolean, default: false },
  fecha_deteccion: { type: Date, default: Date.now }
}, { versionKey: false, collection: 'alertas_ciberseguridad' });

alertaSchema.index({ resuelta: 1, fecha_deteccion: -1 });
alertaSchema.index({ severidad: 1 });

module.exports = mongoose.model('AlertaCiberseguridad', alertaSchema);
