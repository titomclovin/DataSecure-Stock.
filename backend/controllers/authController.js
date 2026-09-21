const crypto = require('crypto');
const Usuario = require('../models/Usuario');
const { firmarToken } = require('../middlewares/autenticacion');
const { enviarEnlaceRecuperacion } = require('../utils/correo');

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const usuario = await Usuario.findOne({ email: String(email).toLowerCase() }).select('+password_hash');

    // Respuesta uniforme: no se revela si el correo existe o si fallo la clave.
    const credencialesInvalidas = () =>
      res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });

    if (!usuario) return credencialesInvalidas();
    if (!usuario.estado) {
      return res.status(403).json({ ok: false, error: 'La cuenta se encuentra desactivada' });
    }
    if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
      return res.status(423).json({ ok: false, error: 'Cuenta bloqueada temporalmente por intentos fallidos' });
    }

    const valida = await usuario.verificarClave(password);
    if (!valida) {
      usuario.intentos_fallidos += 1;
      if (usuario.intentos_fallidos >= MAX_INTENTOS) {
        usuario.bloqueado_hasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60 * 1000);
        usuario.intentos_fallidos = 0;
      }
      await usuario.save();
      res.locals.accion = 'Intento de login fallido';
      return credencialesInvalidas();
    }

    usuario.intentos_fallidos = 0;
    usuario.bloqueado_hasta = null;
    await usuario.save();

    res.locals.accion = 'Inicio de sesion';
    return res.json({
      ok: true,
      token: firmarToken(usuario),
      usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });
  } catch (e) { next(e); }
}

async function perfil(req, res) {
  const u = req.usuario;
  res.json({ ok: true, usuario: { id: u._id, nombre: u.nombre, email: u.email, rol: u.rol } });
}

async function solicitarRecuperacion(req, res, next) {
  try {
    const { email } = req.body;
    const usuario = await Usuario.findOne({ email: String(email).toLowerCase() });
    res.locals.accion = 'Solicitud de recuperacion de credenciales';

    // Enumeracion de cuentas: la respuesta es la misma exista o no el correo.
    if (usuario && usuario.estado) {
      const bruto = crypto.randomBytes(32).toString('hex');
      usuario.token_recuperacion = crypto.createHash('sha256').update(bruto).digest('hex');
      usuario.token_recuperacion_exp = new Date(Date.now() + 30 * 60 * 1000);
      await usuario.save();
      const base = process.env.URL_PUBLICA || 'http://localhost:3000';
      await enviarEnlaceRecuperacion(usuario.email, `${base}/restablecer.html?token=${bruto}`);
    }
    return res.json({ ok: true, mensaje: 'Si el correo esta registrado, recibira un enlace de recuperacion' });
  } catch (e) { next(e); }
}

async function restablecer(req, res, next) {
  try {
    const { token, password } = req.body;
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const usuario = await Usuario.findOne({
      token_recuperacion: hash,
      token_recuperacion_exp: { $gt: new Date() }
    }).select('+token_recuperacion +token_recuperacion_exp');

    if (!usuario) {
      return res.status(400).json({ ok: false, error: 'Enlace de recuperacion invalido o vencido' });
    }
    usuario.password_hash = await Usuario.hashear(password);
    usuario.token_recuperacion = null;
    usuario.token_recuperacion_exp = null;
    usuario.intentos_fallidos = 0;
    usuario.bloqueado_hasta = null;
    await usuario.save();
    res.locals.accion = 'Restablecimiento de contrasena';
    return res.json({ ok: true, mensaje: 'Contrasena actualizada' });
  } catch (e) { next(e); }
}

module.exports = { login, perfil, solicitarRecuperacion, restablecer };
