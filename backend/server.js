require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const { crearApp } = require('./app');
const { conectar } = require('./config/db');

const PUERTO = process.env.PORT || 3000;

async function iniciar() {
  await conectar();
  console.log('Conexion establecida con el cluster MongoDB');

  const app = crearApp();
  const servidor = http.createServer(app);

  const io = new Server(servidor, { cors: { origin: process.env.ORIGEN_PERMITIDO || '*' } });

  // El canal en tiempo real tambien exige token: un socket anonimo no recibe alertas.
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    try {
      const carga = jwt.verify(token, process.env.JWT_SECRET || 'cambiar-en-produccion', { issuer: 'datasecure-stock' });
      socket.data.rol = carga.rol;
      socket.data.email = carga.email;
      next();
    } catch (e) {
      next(new Error('Canal de eventos no autorizado'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.data.rol === 'Administrador') socket.join('panel-administrador');
    console.log(`[socket] conectado ${socket.data.email} (${socket.data.rol})`);
  });

  app.set('io', io);

  servidor.listen(PUERTO, () => {
    console.log(`DataSecure Stock escuchando en el puerto ${PUERTO}`);
  });

  return servidor;
}

if (require.main === module) {
  iniciar().catch(err => {
    console.error('No fue posible iniciar el servicio:', err.message);
    process.exit(1);
  });
}

module.exports = { iniciar };
