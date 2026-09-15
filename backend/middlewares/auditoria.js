const LogOperativo = require('../models/LogOperativo');
const { evaluarEvento } = require('../utils/motorAnalitico');

/**
 * Escribe en la coleccion append-only un documento por cada peticion que
 * modifica estado o intenta autenticarse, y entrega el evento al motor
 * analitico para que decida si corresponde levantar una alerta.
 */
function auditar(app) {
  return function (req, res, next) {
    const inicio = Date.now();
    res.on('finish', async () => {
      const metodo = req.method;
      const esLectura = metodo === 'GET';
      const esAuth = req.originalUrl.startsWith('/api/auth');
      if (esLectura && !esAuth) return;
      try {
        const registro = await LogOperativo.create({
          id_usuario:       req.usuario ? req.usuario._id : null,
          email_usuario:    req.usuario ? req.usuario.email : (req.body && req.body.email) || 'anonimo',
          accion:           res.locals.accion || `${metodo} ${req.route ? req.baseUrl + req.route.path : req.originalUrl}`,
          recurso:          req.originalUrl,
          metodo_http:      metodo,
          codigo_respuesta: res.statusCode,
          ip_origen:        req.ip || req.socket.remoteAddress || '',
          agente_usuario:   (req.headers['user-agent'] || '').slice(0, 180),
          exito:            res.statusCode < 400
        });
        const alerta = await evaluarEvento(registro, { duracion_ms: Date.now() - inicio });
        if (alerta) {
          const io = app.get('io');
          if (io) io.to('panel-administrador').emit('alerta:nueva', alerta);
        }
      } catch (e) {
        // La auditoria nunca puede tumbar la peticion del usuario.
        console.error('[auditoria] no se pudo registrar el evento:', e.message);
      }
    });
    next();
  };
}

module.exports = { auditar };
