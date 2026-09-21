const rateLimit = require('express-rate-limit');

// Limite general de la API: frena el escaneo automatizado de endpoints.
const limitadorGlobal = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas peticiones desde esta direccion IP' }
});

// Limite estricto en autenticacion: frena la fuerza bruta sobre contrasenas.
const limitadorLogin = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos de acceso. Reintente en 10 minutos' }
});

// Limite propio para la recuperacion de credenciales: si compartiera el
// contador con el login, un ataque de fuerza bruta dejaria sin recuperacion
// de contrasena al usuario legitimo de esa misma red.
const limitadorRecuperacion = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes de recuperacion. Reintente mas tarde' }
});

module.exports = { limitadorGlobal, limitadorLogin, limitadorRecuperacion };
