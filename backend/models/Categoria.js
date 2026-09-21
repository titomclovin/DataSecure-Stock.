const mongoose = require('mongoose');

const categoriaSchema = new mongoose.Schema({
  nombre_categoria: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
  descripcion:      { type: String, trim: true, maxlength: 240, default: '' },
  activa:           { type: Boolean, default: true }
}, { timestamps: { createdAt: 'creado_en', updatedAt: 'actualizado_en' }, collection: 'categorias' });

module.exports = mongoose.model('Categoria', categoriaSchema);
