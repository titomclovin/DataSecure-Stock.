const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema({
  sku:           { type: String, required: true, unique: true, uppercase: true, trim: true },
  nombre:        { type: String, required: true, trim: true, maxlength: 120 },
  id_categoria:  { type: mongoose.Schema.Types.ObjectId, ref: 'Categoria', required: true },
  id_proveedor:  { type: mongoose.Schema.Types.ObjectId, ref: 'Proveedor', required: true },
  stock_actual:  { type: Number, required: true, min: 0, default: 0 },
  stock_critico: { type: Number, required: true, min: 0, default: 5 },
  precio:        { type: Number, required: true, min: 0 },
  activo:        { type: Boolean, default: true }
}, { timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' }, collection: 'productos' });

productoSchema.index({ id_categoria: 1, activo: 1 });
productoSchema.index({ nombre: 'text', sku: 'text' });

module.exports = mongoose.model('Producto', productoSchema);
