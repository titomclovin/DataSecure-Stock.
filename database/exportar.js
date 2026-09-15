/**
 * Exporta el contenido de las siete colecciones a archivos JSON.
 * Sirve como respaldo del modelo de datos y como material de evidencia.
 *
 *   node database/exportar.js [carpeta destino]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { conectar, desconectar } = require('../backend/config/db');

const COLECCIONES = [
  'usuarios', 'categorias', 'proveedores', 'productos',
  'movimientos', 'logs_operativos', 'alertas_ciberseguridad'
];

const CAMPOS_OMITIDOS = ['password_hash', 'token_recuperacion', 'token_recuperacion_exp'];

async function main() {
  const destino = process.argv[2] || path.join(__dirname, 'export');
  fs.mkdirSync(destino, { recursive: true });

  const conexion = await conectar();
  const resumen = [];

  for (const nombre of COLECCIONES) {
    const documentos = await conexion.db.collection(nombre).find({}).limit(5000).toArray();
    // Las credenciales no salen ni siquiera en el respaldo de evidencia.
    documentos.forEach(d => CAMPOS_OMITIDOS.forEach(c => { delete d[c]; }));
    const archivo = path.join(destino, nombre + '.json');
    fs.writeFileSync(archivo, JSON.stringify(documentos, null, 2), 'utf8');
    resumen.push({ coleccion: nombre, documentos: documentos.length, archivo: path.basename(archivo) });
    console.log(`${nombre.padEnd(24)} ${String(documentos.length).padStart(5)} documentos`);
  }

  fs.writeFileSync(path.join(destino, '_resumen.json'),
    JSON.stringify({ fecha: new Date().toISOString(), colecciones: resumen }, null, 2), 'utf8');

  await desconectar();
}

main().catch(e => { console.error(e); process.exit(1); });
