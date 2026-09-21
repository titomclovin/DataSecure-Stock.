const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');

const rutas = require('./routes');
const { auditar } = require('./middlewares/auditoria');
const { limitadorGlobal } = require('./middlewares/limitador');
const { noEncontrado, manejadorErrores } = require('./middlewares/errores');

/**
 * Construccion de la aplicacion Express separada del arranque del servidor:
 * asi la suite de pruebas puede levantar la API sin abrir un puerto fijo.
 */
function crearApp() {
  const app = express();

  app.set('trust proxy', 1);

  // Cabeceras de seguridad: CSP, X-Frame-Options, HSTS, sin X-Powered-By.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true }
  }));

  app.use(cors({ origin: process.env.ORIGEN_PERMITIDO || true, credentials: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  // Neutraliza operadores de MongoDB ($gt, $ne) enviados desde el formulario.
  app.use(mongoSanitize({ replaceWith: '_' }));

  app.use(limitadorGlobal);
  app.use(auditar(app));

  app.use('/api', rutas);
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  app.use(noEncontrado);
  app.use(manejadorErrores);

  return app;
}

module.exports = { crearApp };
