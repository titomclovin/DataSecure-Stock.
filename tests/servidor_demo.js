/**
 * Servidor de demostracion.
 * Levanta una instancia real de MongoDB efimera, la puebla con el seed y sirve
 * la aplicacion completa. Sirve para mostrar el sistema en un equipo que no
 * tenga MongoDB instalado, sin tocar la configuracion de produccion.
 *
 *   node tests/servidor_demo.js [puerto]
 */
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PUERTO = Number(process.argv[2]) || 3080;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'demostracion-datasecure-stock';

(async () => {
  const memoria = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoria.getUri() + 'datasecure_stock';

  const { conectar } = require('../backend/config/db');
  const { crearApp } = require('../backend/app');
  const { poblar } = require('../backend/seed');

  await conectar();
  const resumen = await poblar();

  const app = crearApp();
  const servidor = http.createServer(app);
  const io = new Server(servidor, { cors: { origin: '*' } });
  io.use((socket, next) => {
    try {
      const carga = jwt.verify(socket.handshake.auth.token, process.env.JWT_SECRET, { issuer: 'datasecure-stock' });
      socket.data.rol = carga.rol;
      next();
    } catch (e) { next(new Error('Canal de eventos no autorizado')); }
  });
  io.on('connection', s => { if (s.data.rol === 'Administrador') s.join('panel-administrador'); });
  app.set('io', io);

  servidor.listen(PUERTO, () => {
    console.log('Documentos cargados:', JSON.stringify(resumen));
    console.log(`Demostracion disponible en http://localhost:${PUERTO}`);
    console.log('Administrador: admin@tecnosur.cl / Admin2026#Seguro');
    console.log('Operador:      operador@tecnosur.cl / Operador2026#Bod');
  });

  const cerrar = async () => { await memoria.stop(); process.exit(0); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
})().catch(e => { console.error(e); process.exit(1); });
