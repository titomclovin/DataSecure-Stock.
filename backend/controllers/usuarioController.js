const Usuario = require('../models/Usuario');

async function listar(req, res, next) {
  try {
    const datos = await Usuario.find().sort({ creado_en: -1 }).lean();
    res.json({ ok: true, total: datos.length, datos });
  } catch (e) { next(e); }
}

async function crear(req, res, next) {
  try {
    const { nombre, email, password, rol } = req.body;
    const existe = await Usuario.findOne({ email: String(email).toLowerCase() });
    if (existe) return res.status(409).json({ ok: false, error: 'El correo ya esta registrado' });
    const usuario = await Usuario.create({
      nombre, email, rol,
      password_hash: await Usuario.hashear(password)
    });
    res.locals.accion = 'Alta de cuenta de usuario';
    res.status(201).json({
      ok: true,
      dato: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, estado: usuario.estado }
    });
  } catch (e) { next(e); }
}

async function actualizar(req, res, next) {
  try {
    const cambios = {};
    ['nombre', 'rol', 'estado'].forEach(c => { if (req.body[c] !== undefined) cambios[c] = req.body[c]; });
    if (req.body.password) cambios.password_hash = await Usuario.hashear(req.body.password);
    const usuario = await Usuario.findByIdAndUpdate(req.params.id, cambios, { new: true, runValidators: true });
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.locals.accion = 'Modificacion de cuenta de usuario';
    res.json({ ok: true, dato: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, estado: usuario.estado } });
  } catch (e) { next(e); }
}

/** Desactivacion, no borrado: el historial de auditoria debe seguir apuntando a la cuenta. */
async function desactivar(req, res, next) {
  try {
    if (req.params.id === req.usuario._id.toString()) {
      return res.status(400).json({ ok: false, error: 'Una cuenta no puede desactivarse a si misma' });
    }
    const usuario = await Usuario.findByIdAndUpdate(req.params.id, { estado: false }, { new: true });
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.locals.accion = 'Desactivacion de cuenta de usuario';
    res.json({ ok: true, mensaje: 'Cuenta desactivada' });
  } catch (e) { next(e); }
}

module.exports = { listar, crear, actualizar, desactivar };
