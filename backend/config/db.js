const mongoose = require('mongoose');

/**
 * Conexion unica al cluster MongoDB.
 * En produccion la URI apunta al Replica Set (MongoDB Atlas); en desarrollo,
 * a la instancia local. La cadena nunca se escribe en el codigo: viaja por
 * variable de entorno (.env) para no exponer credenciales en el repositorio.
 */
async function conectar(uri) {
  const cadena = uri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/datasecure_stock';
  mongoose.set('strictQuery', true);
  await mongoose.connect(cadena, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 50
  });
  return mongoose.connection;
}

async function desconectar() {
  await mongoose.connection.close();
}

module.exports = { conectar, desconectar };
