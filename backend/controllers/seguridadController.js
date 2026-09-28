const LogOperativo = require('../models/LogOperativo');
const Alerta = require('../models/AlertaCiberseguridad');
const { indicadoresPanel } = require('../utils/motorAnalitico');

async function logs(req, res, next) {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const limite = Math.min(200, Math.max(1, parseInt(req.query.limite, 10) || 25));
    const filtro = {};
    if (req.query.exito !== undefined) filtro.exito = req.query.exito === 'true';
    if (req.query.ip) filtro.ip_origen = req.query.ip;
    const [datos, total] = await Promise.all([
      LogOperativo.find(filtro).sort({ fecha_timestamp: -1 }).skip((pagina - 1) * limite).limit(limite).lean(),
      LogOperativo.countDocuments(filtro)
    ]);
    res.json({ ok: true, pagina, limite, total, paginas: Math.ceil(total / limite), datos });
  } catch (e) { next(e); }
}

async function alertas(req, res, next) {
  try {
    const filtro = {};
    if (req.query.resuelta !== undefined) filtro.resuelta = req.query.resuelta === 'true';
    const datos = await Alerta.find(filtro).sort({ fecha_deteccion: -1 }).limit(100).lean();
    res.json({ ok: true, total: datos.length, datos });
  } catch (e) { next(e); }
}

async function resolverAlerta(req, res, next) {
  try {
    const alerta = await Alerta.findByIdAndUpdate(req.params.id, { resuelta: true }, { new: true });
    if (!alerta) return res.status(404).json({ ok: false, error: 'Alerta no encontrada' });
    res.locals.accion = 'Cierre de alerta de ciberseguridad';
    res.json({ ok: true, dato: alerta });
  } catch (e) { next(e); }
}

async function panel(req, res, next) {
  try {
    res.json({ ok: true, indicadores: await indicadoresPanel() });
  } catch (e) { next(e); }
}

module.exports = { logs, alertas, resolverAlerta, panel };
