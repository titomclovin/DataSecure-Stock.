require('dotenv').config();
const { conectar, desconectar } = require('./config/db');

const Usuario = require('./models/Usuario');
const Categoria = require('./models/Categoria');
const Proveedor = require('./models/Proveedor');
const Producto = require('./models/Producto');
const Movimiento = require('./models/Movimiento');
const LogOperativo = require('./models/LogOperativo');
const Alerta = require('./models/AlertaCiberseguridad');

const CATEGORIAS = [
  ['Notebooks', 'Equipos portatiles de uso corporativo y domestico'],
  ['Perifericos', 'Teclados, mouse, audifonos y accesorios de escritorio'],
  ['Almacenamiento', 'Discos solidos, discos mecanicos y unidades externas'],
  ['Redes', 'Routers, switches, puntos de acceso y cableado estructurado'],
  ['Componentes', 'Tarjetas de video, memorias RAM y fuentes de poder'],
  ['Monitores', 'Pantallas LED e IPS para estaciones de trabajo']
];

const PROVEEDORES = [
  ['Importadora Andes Tech SpA', '76543210-9', 'Marcela Fuentes', 'compras@andestech.cl', 5],
  ['Distribuidora Pacifico Digital Ltda.', '77891234-5', 'Rodrigo Salas', 'ventas@pacificodigital.cl', 4],
  ['Comercial Nexus Chile SpA', '78123456-7', 'Carla Bravo', 'contacto@nexuschile.cl', 4],
  ['Mayorista Sur Informatica Ltda.', '76998877-1', 'Ignacio Reyes', 'pedidos@surinformatica.cl', 3],
  ['Global Hardware Import SpA', '79456123-K', 'Paula Moreno', 'import@globalhardware.cl', 3]
];

const PRODUCTOS = [
  ['NB-1001', 'Notebook 14 pulgadas Core i5 16GB', 'Notebooks', 0, 34, 6, 649990],
  ['NB-1002', 'Notebook 15 pulgadas Ryzen 7 16GB', 'Notebooks', 0, 21, 5, 729990],
  ['NB-1003', 'Notebook empresarial 13 pulgadas Core i7', 'Notebooks', 1, 12, 4, 989990],
  ['PE-2001', 'Teclado mecanico retroiluminado', 'Perifericos', 1, 86, 15, 49990],
  ['PE-2002', 'Mouse inalambrico ergonomico', 'Perifericos', 1, 124, 20, 24990],
  ['PE-2003', 'Audifonos con cancelacion de ruido', 'Perifericos', 2, 43, 10, 89990],
  ['PE-2004', 'Camara web full HD con obturador', 'Perifericos', 2, 57, 12, 39990],
  ['AL-3001', 'Disco solido NVMe 1 TB', 'Almacenamiento', 0, 68, 12, 74990],
  ['AL-3002', 'Disco duro externo 4 TB', 'Almacenamiento', 3, 39, 8, 94990],
  ['AL-3003', 'Pendrive USB 3.2 de 256 GB', 'Almacenamiento', 3, 152, 25, 17990],
  ['RE-4001', 'Router WiFi 6 doble banda', 'Redes', 2, 27, 6, 119990],
  ['RE-4002', 'Switch administrable 24 puertos', 'Redes', 4, 9, 3, 259990],
  ['RE-4003', 'Punto de acceso PoE para interiores', 'Redes', 4, 16, 5, 139990],
  ['CO-5001', 'Tarjeta de video 8 GB GDDR6', 'Componentes', 0, 14, 4, 469990],
  ['CO-5002', 'Memoria RAM DDR5 16 GB', 'Componentes', 4, 73, 15, 69990],
  ['CO-5003', 'Fuente de poder 750W certificada', 'Componentes', 3, 22, 6, 89990],
  ['MO-6001', 'Monitor 24 pulgadas IPS 75 Hz', 'Monitores', 1, 41, 8, 129990],
  ['MO-6002', 'Monitor 27 pulgadas QHD 144 Hz', 'Monitores', 2, 18, 5, 279990]
];

function aleatorio(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function poblar() {
  await Promise.all([
    Usuario.deleteMany({}), Categoria.deleteMany({}), Proveedor.deleteMany({}),
    Producto.deleteMany({}), Movimiento.deleteMany({}), LogOperativo.deleteMany({}), Alerta.deleteMany({})
  ]);

  const admin = await Usuario.create({
    nombre: 'Hector Molina Molina', email: 'admin@tecnosur.cl', rol: 'Administrador',
    password_hash: await Usuario.hashear('Admin2026#Seguro')
  });
  const operador = await Usuario.create({
    nombre: 'Camila Ortega Vidal', email: 'operador@tecnosur.cl', rol: 'Operador',
    password_hash: await Usuario.hashear('Operador2026#Bod')
  });
  const operador2 = await Usuario.create({
    nombre: 'Luis Carrasco Pinto', email: 'bodega2@tecnosur.cl', rol: 'Operador',
    password_hash: await Usuario.hashear('Bodega2026#Sur')
  });

  const categorias = await Categoria.insertMany(
    CATEGORIAS.map(([nombre_categoria, descripcion]) => ({ nombre_categoria, descripcion }))
  );
  const proveedores = await Proveedor.insertMany(
    PROVEEDORES.map(([razon_social, rut_empresa, contacto, email_contacto, nivel_confianza]) =>
      ({ razon_social, rut_empresa, contacto, email_contacto, nivel_confianza }))
  );

  const mapaCat = Object.fromEntries(categorias.map(c => [c.nombre_categoria, c._id]));

  const productos = await Producto.insertMany(PRODUCTOS.map(
    ([sku, nombre, cat, idxProv, stock_actual, stock_critico, precio]) => ({
      sku, nombre,
      id_categoria: mapaCat[cat],
      id_proveedor: proveedores[idxProv]._id,
      stock_actual, stock_critico, precio
    })
  ));

  // Historial operativo de los ultimos 30 dias: base real para el panel.
  const movimientos = [];
  const operadores = [operador, operador2, admin];
  for (let dia = 30; dia >= 0; dia--) {
    const cuantos = aleatorio(4, 12);
    for (let k = 0; k < cuantos; k++) {
      const producto = productos[aleatorio(0, productos.length - 1)];
      const usuario = operadores[aleatorio(0, operadores.length - 1)];
      const tipo = Math.random() < 0.45 ? 'Entrada' : 'Salida';
      const cantidad = tipo === 'Entrada' ? aleatorio(5, 40) : aleatorio(1, 12);
      const fecha = new Date(Date.now() - dia * 86400000 + aleatorio(8, 19) * 3600000 + aleatorio(0, 59) * 60000);
      movimientos.push({
        id_producto: producto._id, id_usuario: usuario._id, id_proveedor: producto.id_proveedor,
        tipo_operacion: tipo, cantidad,
        stock_resultante: Math.max(0, producto.stock_actual + (tipo === 'Entrada' ? cantidad : -cantidad)),
        observacion: tipo === 'Entrada' ? 'Recepcion de orden de compra' : 'Despacho a cliente',
        fecha_timestamp: fecha
      });
    }
  }
  await Movimiento.insertMany(movimientos);

  // Telemetria historica: alimenta la coleccion append-only sobre la que
  // corre el motor analitico.
  const logs = [];
  const acciones = [
    ['Inicio de sesion', '/api/auth/login', 'POST', 200, true],
    ['Consulta de catalogo', '/api/productos', 'GET', 200, true],
    ['Movimiento de salida de stock', '/api/movimientos', 'POST', 201, true],
    ['Movimiento de entrada de stock', '/api/movimientos', 'POST', 201, true],
    ['Intento de login fallido', '/api/auth/login', 'POST', 401, false],
    ['Alta en productos', '/api/productos', 'POST', 201, true],
    ['Intento de acceso fuera de perfil', '/api/usuarios', 'GET', 403, false]
  ];
  for (let dia = 30; dia >= 0; dia--) {
    const cuantos = aleatorio(20, 45);
    for (let k = 0; k < cuantos; k++) {
      const [accion, recurso, metodo_http, codigo_respuesta, exito] = acciones[aleatorio(0, acciones.length - 1)];
      const usuario = operadores[aleatorio(0, operadores.length - 1)];
      logs.push({
        id_usuario: usuario._id, email_usuario: usuario.email,
        accion, recurso, metodo_http, codigo_respuesta, exito,
        ip_origen: `190.15.${aleatorio(1, 60)}.${aleatorio(2, 250)}`,
        agente_usuario: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        fecha_timestamp: new Date(Date.now() - dia * 86400000 + aleatorio(7, 21) * 3600000 + aleatorio(0, 59) * 60000)
      });
    }
  }
  await LogOperativo.insertMany(logs);

  await Alerta.insertMany([
    {
      tipo_amenaza: 'Fuerza bruta sobre credenciales', severidad: 'Alta',
      descripcion: '7 intentos de acceso fallidos desde 45.190.22.114 en 10 minutos',
      ip_origen: '45.190.22.114',
      evidencia: { intentos: 7, cuentas_probadas: ['admin@tecnosur.cl', 'root@tecnosur.cl'], ventana_min: 10 },
      fecha_deteccion: new Date(Date.now() - 3 * 86400000)
    },
    {
      tipo_amenaza: 'Intento de acceso fuera de perfil', severidad: 'Media',
      descripcion: 'El usuario bodega2@tecnosur.cl intento operar sobre /api/usuarios sin privilegios para ese recurso',
      ip_origen: '190.15.34.20', id_usuario: operador2._id,
      evidencia: { recurso: '/api/usuarios', metodo: 'GET' },
      resuelta: true, fecha_deteccion: new Date(Date.now() - 6 * 86400000)
    }
  ]);

  const resumen = {
    usuarios: await Usuario.countDocuments(),
    categorias: await Categoria.countDocuments(),
    proveedores: await Proveedor.countDocuments(),
    productos: await Producto.countDocuments(),
    movimientos: await Movimiento.countDocuments(),
    logs_operativos: await LogOperativo.countDocuments(),
    alertas: await Alerta.countDocuments()
  };
  return resumen;
}

async function main() {
  await conectar();
  const resumen = await poblar();
  console.log('Base de datos poblada:');
  Object.entries(resumen).forEach(([k, v]) => console.log(`  ${k.padEnd(18)} ${v} documentos`));
  await desconectar();
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { poblar };
