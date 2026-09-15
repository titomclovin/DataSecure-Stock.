const mongoose = require('mongoose');
const Movimiento = require('../models/Movimiento');
const Producto = require('../models/Producto');

/**
 * Registro de entrada o salida de stock.
 * El descuento de stock y la escritura del movimiento se hacen sobre el mismo
 * documento con $inc, de modo que dos operarios simultaneos no puedan dejar el
 * inventario en un valor imposible: la condicion de stock suficiente viaja
 * dentro del propio filtro de actualizacion.
 */
async function registrar(req, res, next) {
  try {
    const { id_producto, tipo_operacion, cantidad, observacion } = req.body;
    const unidades = Number(cantidad);

    if (!mongoose.isValidObjectId(id_producto)) {
      return res.status(400).json({ ok: false, error: 'Identificador de producto no valido' });
    }

    const delta = tipo_operacion === 'Entrada' ? unidades : -unidades;
    const filtro = { _id: id_producto, activo: true };
    if (tipo_operacion === 'Salida') filtro.stock_actual = { $gte: unidades };

    const producto = await Producto.findOneAndUpdate(filtro, { $inc: { stock_actual: delta } }, { new: true });
    if (!producto) {
      const existe = await Producto.findById(id_producto).lean();
      if (!existe) return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
      return res.status(409).json({ ok: false, error: 'Stock insuficiente para la salida solicitada' });
    }

    const movimiento = await Movimiento.create({
      id_producto:      producto._id,
      id_usuario:       req.usuario._id,
      id_proveedor:     producto.id_proveedor,
      tipo_operacion,
      cantidad:         unidades,
      stock_resultante: producto.stock_actual,
      observacion:      observacion || ''
    });

    res.locals.accion = `Movimiento de ${tipo_operacion.toLowerCase()} de stock`;

    const io = req.app.get('io');
    if (io) {
      io.emit('stock:cambio', {
        sku: producto.sku,
        producto: producto.nombre,
        tipo: tipo_operacion,
        cantidad: unidades,
        stock_actual: producto.stock_actual,
        critico: producto.stock_actual <= producto.stock_critico
      });
    }

    res.status(201).json({ ok: true, dato: movimiento, stock_actual: producto.stock_actual });
  } catch (e) { next(e); }
}

async function historial(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 20));
    const filtro = {};
    if (req.query.id_producto && mongoose.isValidObjectId(req.query.id_producto)) {
      filtro.id_producto = req.query.id_producto;
    }
    if (req.query.tipo) filtro.tipo_operacion = req.query.tipo;

    const [datos, total] = await Promise.all([
      Movimiento.find(filtro)
        .sort({ fecha_timestamp: -1 })
        .skip((pagina - 1) * limite).limit(limite)
        .populate('id_producto', 'sku nombre')
        .populate('id_usuario', 'nombre email rol')
        .lean(),
      Movimiento.countDocuments(filtro)
    ]);
    res.json({ ok: true, pagina, limite, total, paginas: Math.ceil(total / limite), datos });
  } catch (e) { next(e); }
}

module.exports = { registrar, historial };
