const mongoose = require('mongoose');

/**
 * Venta o compra confirmada desde el carro.
 * El detalle va EMBEBIDO: cada linea guarda el codigo, el nombre y el precio
 * vigentes al confirmar, de modo que el comprobante no cambia aunque despues se
 * modifique el catalogo. El producto, el usuario y el proveedor van por
 * REFERENCIA, porque tienen identidad propia y se consultan por si mismos.
 */
const lineaSchema = new mongoose.Schema({
  id_producto:      { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
  sku:              { type: String, required: true },
  nombre:           { type: String, required: true },
  cantidad:         { type: Number, required: true, min: 1, max: 10000 },
  precio_unitario:  { type: Number, required: true, min: 0 },
  subtotal:         { type: Number, required: true, min: 0 },
  stock_resultante: { type: Number, required: true, min: 0 }
}, { _id: false });

const transaccionSchema = new mongoose.Schema({
  folio:        { type: String, required: true, unique: true, match: /^[VC]-\d{6}$/ },
  tipo:         { type: String, required: true, enum: ['Venta', 'Compra'] },
  detalle:      { type: [lineaSchema],
                  validate: [v => v.length >= 1 && v.length <= 50, 'El carro debe tener entre 1 y 50 líneas'] },
  cliente: {
    nombre:     { type: String, trim: true, maxlength: 80, default: '' },
    rut:        { type: String, trim: true, default: '' }
  },
  id_proveedor: { type: mongoose.Schema.Types.ObjectId, ref: 'Proveedor', default: null },
  razon_social: { type: String, trim: true, default: '' },
  unidades:     { type: Number, required: true, min: 1 },
  neto:         { type: Number, required: true, min: 0 },
  iva:          { type: Number, required: true, min: 0 },
  total:        { type: Number, required: true, min: 0 },
  id_usuario:   { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  observacion:  { type: String, trim: true, maxlength: 240, default: '' },
  fecha_timestamp: { type: Date, default: Date.now }
}, { versionKey: false, collection: 'transacciones' });

// Historial por tipo y fecha, historial propio de cada usuario y ventas de un producto.
transaccionSchema.index({ tipo: 1, fecha_timestamp: -1 });
transaccionSchema.index({ id_usuario: 1, fecha_timestamp: -1 });
transaccionSchema.index({ 'detalle.id_producto': 1 });

module.exports = mongoose.model('Transaccion', transaccionSchema);
