const Transaccion = require('../models/Transaccion');
const { confirmar } = require('../utils/transacciones');

/**
 * Confirmacion del carro de compra y venta.
 * La venta la pueden registrar ambos perfiles; la compra a proveedores queda
 * reservada al Administrador (privilegio minimo): la respuesta 403 queda en la
 * bitacora y el motor analitico la evalua como intento fuera de perfil.
 */
async function registrar(req, res, next) {
  const { tipo } = req.body;
  try {
    if (tipo === 'Compra' && req.usuario.rol !== 'Administrador') {
      res.locals.accion = 'Intento de compra sin privilegios';
      return res.status(403).json({ ok: false, error: 'Solo el perfil Administrador registra compras a proveedores' });
    }

    const { transaccion, criticos } = await confirmar(req.body, req.usuario);
    res.locals.accion = `${tipo} confirmada ${transaccion.folio}`;

    const io = req.app.get('io');
    if (io) {
      io.emit('transaccion:nueva', {
        folio: transaccion.folio,
        tipo,
        total: transaccion.total,
        unidades: transaccion.unidades,
        lineas: transaccion.detalle.length,
        responsable: req.usuario.nombre,
        criticos
      });
    }

    res.status(201).json({ ok: true, dato: transaccion, criticos });
  } catch (e) {
    if (e.status) {
      res.locals.accion = `${tipo || 'Operación'} rechazada: ${e.message}`.slice(0, 180);
      return res.status(e.status).json({ ok: false, error: e.message, detalle: e.detalle });
    }
    next(e);
  }
}

/** Historial paginado. El Operador ve solo las operaciones que el mismo registro. */
async function listar(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(100, Math.max(1, parseInt(req.query.limite, 10) || 20));
    const filtro = {};
    if (req.query.tipo) filtro.tipo = req.query.tipo;
    if (req.usuario.rol !== 'Administrador') filtro.id_usuario = req.usuario._id;

    const [datos, total] = await Promise.all([
      Transaccion.find(filtro)
        .sort({ fecha_timestamp: -1 })
        .skip((pagina - 1) * limite).limit(limite)
        .populate('id_usuario', 'nombre email rol')
        .lean(),
      Transaccion.countDocuments(filtro)
    ]);
    res.json({ ok: true, pagina, limite, total, paginas: Math.ceil(total / limite), datos });
  } catch (e) { next(e); }
}

/** Comprobante de una operacion. */
async function obtener(req, res, next) {
  try {
    const dato = await Transaccion.findById(req.params.id)
      .populate('id_usuario', 'nombre email rol')
      .populate('id_proveedor', 'razon_social rut_empresa')
      .lean();
    if (!dato) return res.status(404).json({ ok: false, error: 'Operación no encontrada' });
    const propia = dato.id_usuario && String(dato.id_usuario._id) === String(req.usuario._id);
    if (req.usuario.rol !== 'Administrador' && !propia) {
      return res.status(403).json({ ok: false, error: 'Solo puede consultar las operaciones que usted registró' });
    }
    res.json({ ok: true, dato });
  } catch (e) { next(e); }
}

module.exports = { registrar, listar, obtener };
