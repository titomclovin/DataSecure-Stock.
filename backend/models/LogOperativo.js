const mongoose = require('mongoose');

/**
 * Coleccion append-only: no se actualiza ni se borra ningun documento.
 * Es la fuente de datos masivos sobre la que corre el motor analitico.
 */
const logSchema = new mongoose.Schema({
  id_usuario:       { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  email_usuario:    { type: String, default: 'anonimo' },
  accion:           { type: String, required: true },
  recurso:          { type: String, default: '' },
  metodo_http:      { type: String, default: '' },
  codigo_respuesta: { type: Number, default: 200 },
  ip_origen:        { type: String, default: '' },
  agente_usuario:   { type: String, default: '' },
  exito:            { type: Boolean, default: true },
  fecha_timestamp:  { type: Date, default: Date.now }
}, { versionKey: false, collection: 'logs_operativos' });

logSchema.index({ fecha_timestamp: -1 });
logSchema.index({ ip_origen: 1, fecha_timestamp: -1 });
logSchema.index({ id_usuario: 1, accion: 1 });

module.exports = mongoose.model('LogOperativo', logSchema);
