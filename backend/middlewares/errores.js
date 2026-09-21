const { validationResult } = require('express-validator');

/**
 * Corta la peticion cuando express-validator encontro campos invalidos.
 * Devuelve 400 con la lista de campos, sin exponer la consulta interna.
 */
function validar(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({
      ok: false,
      error: 'Datos de entrada no validos',
      campos: errores.array().map(e => ({ campo: e.path, detalle: e.msg }))
    });
  }
  next();
}

function noEncontrado(req, res) {
  res.status(404).json({ ok: false, error: 'Recurso no encontrado' });
}

/**
 * Manejador global de excepciones. En produccion suprime el stack trace
 * para no filtrar rutas internas ni versiones de dependencias.
 */
function manejadorErrores(err, req, res, next) { // eslint-disable-line no-unused-vars
  const codigo = err.status || (err.name === 'ValidationError' ? 400 : 500);
  const cuerpo = {
    ok: false,
    error: codigo === 500 ? 'Error interno del servidor' : err.message
  };
  if (process.env.NODE_ENV !== 'production' && codigo === 500) {
    cuerpo.detalle = err.message;
  }
  console.error('[error]', err.message);
  res.status(codigo).json(cuerpo);
}

module.exports = { validar, noEncontrado, manejadorErrores };
