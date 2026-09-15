const mongoose = require('mongoose');

const movimientoSchema = new mongoose.Schema({
  id_producto:      { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  id_usuario:       { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  id_proveedor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Proveedor', default: null },
  tipo_operacion:   { type: String, required: true, enum: ['Entrada', 'Salida'] },
  cantidad:         { type: Number, required: true, min: 1 },
  stock_resultante: { type: Number, required: true, min: 0 },
  observacion:      { type: String, trim: true, maxlength: 240, default: '' },
  fecha_timestamp:  { type: Date, default: Date.now }
}, { versionKey: false, collection: 'movimientos' });

// El historial siempre se consulta por producto y fecha descendente.
movimientoSchema.index({ id_producto: 1, fecha_timestamp: -1 });
movimientoSchema.index({ fecha_timestamp: -1 });

module.exports = mongoose.model('Movimiento', movimientoSchema);
