require('dotenv').config();
const { conectar, desconectar } = require('./config/db');

const Usuario = require('./models/Usuario');
const Categoria = require('./models/Categoria');
const Proveedor = require('./models/Proveedor');
const Producto = require('./models/Producto');
const Movimiento = require('./models/Movimiento');
const Transaccion = require('./models/Transaccion');
const LogOperativo = require('./models/LogOperativo');
const Alerta = require('./models/AlertaCiberseguridad');
const { confirmar } = require('./utils/transacciones');

const CATEGORIAS = [
  ['Notebooks', 'Equipos portátiles de uso corporativo y doméstico'],
  ['Periféricos', 'Teclados, mouse, audífonos y accesorios de escritorio'],
  ['Almacenamiento', 'Discos sólidos, discos mecánicos y unidades externas'],
  ['Redes', 'Routers, switches, puntos de acceso y cableado estructurado'],
  ['Componentes', 'Tarjetas de video, memorias RAM y fuentes de poder'],
  ['Monitores', 'Pantallas LED e IPS para estaciones de trabajo']
];

const PROVEEDORES = [
  ['Importadora Andes Tech SpA', '76543210-9', 'Marcela Fuentes', 'compras@andestech.cl', 5],
  ['Distribuidora Pacífico Digital Ltda.', '77891234-5', 'Rodrigo Salas', 'ventas@pacificodigital.cl', 4],
  ['Comercial Nexus Chile SpA', '78123456-7', 'Carla Bravo', 'contacto@nexuschile.cl', 4],
  ['Mayorista Sur Informática Ltda.', '76998877-1', 'Ignacio Reyes', 'pedidos@surinformatica.cl', 3],
  ['Global Hardware Import SpA', '79456123-K', 'Paula Moreno', 'import@globalhardware.cl', 3]
];

// sku, nombre, categoria, indice del proveedor, stock inicial, stock critico, precio (IVA incluido), activo
const PRODUCTOS = [
  ['NB-1001', 'Notebook 14 pulgadas Core i5 16GB', 'Notebooks', 0, 34, 6, 649990, true],
  ['NB-1002', 'Notebook 15 pulgadas Ryzen 7 16GB', 'Notebooks', 0, 21, 5, 729990, true],
  ['NB-1003', 'Notebook empresarial 13 pulgadas Core i7', 'Notebooks', 1, 12, 4, 989990, true],
  ['PE-2001', 'Teclado mecánico retroiluminado', 'Periféricos', 1, 86, 15, 49990, true],
  ['PE-2002', 'Mouse inalámbrico ergonómico', 'Periféricos', 1, 124, 20, 24990, true],
  ['PE-2003', 'Audífonos con cancelación de ruido', 'Periféricos', 2, 43, 10, 89990, true],
  ['PE-2004', 'Cámara web full HD con obturador', 'Periféricos', 2, 57, 12, 39990, true],
  ['AL-3001', 'Disco sólido NVMe 1 TB', 'Almacenamiento', 0, 68, 12, 74990, true],
  ['AL-3002', 'Disco duro externo 4 TB', 'Almacenamiento', 3, 39, 8, 94990, true],
  ['AL-3003', 'Pendrive USB 3.2 de 256 GB', 'Almacenamiento', 3, 152, 25, 17990, true],
  ['RE-4001', 'Router WiFi 6 doble banda', 'Redes', 2, 27, 6, 119990, true],
  ['RE-4002', 'Switch administrable 24 puertos', 'Redes', 4, 9, 3, 259990, true],
  ['RE-4003', 'Punto de acceso PoE para interiores', 'Redes', 4, 16, 5, 139990, true],
  ['CO-5001', 'Tarjeta de video 8 GB GDDR6', 'Componentes', 0, 14, 4, 469990, true],
  ['CO-5002', 'Memoria RAM DDR5 16 GB', 'Componentes', 4, 73, 15, 69990, true],
  ['CO-5003', 'Fuente de poder 750W certificada', 'Componentes', 3, 22, 6, 89990, true],
  ['MO-6001', 'Monitor 24 pulgadas IPS 75 Hz', 'Monitores', 1, 41, 8, 129990, true],
  ['MO-6002', 'Monitor 27 pulgadas QHD 144 Hz', 'Monitores', 2, 18, 5, 279990, true],
  // Modelo descontinuado: queda en el catalogo con su historial, pero inactivo.
  ['MO-6003', 'Monitor 22 pulgadas HD 60 Hz', 'Monitores', 1, 0, 3, 79990, false]
];

// Clientes de las ventas historicas (datos de demostracion).
const CLIENTES = [
  ['Cliente sin identificar', ''],
  ['Comercial Los Aromos Ltda.', 76412338],
  ['Soluciones Informáticas Pudahuel SpA', 77105662],
  ['Colegio San Esteban', 65098114],
  ['Estudio Contable Brito y Asociados', 76990215],
  ['Cliente sin identificar', '']
];

const AJUSTES_ENTRADA = ['Devolución de cliente', 'Ajuste por conteo físico', 'Reposición desde bodega externa'];
const AJUSTES_SALIDA = ['Merma por producto dañado', 'Ajuste por conteo físico', 'Traslado a servicio técnico'];

/**
 * Generador pseudoaleatorio con semilla fija (mulberry32). La carga inicial
 * produce siempre el mismo juego de datos, de modo que las cifras que reporta el
 * informe se reproducen en cualquier equipo que ejecute el seed.
 */
const SEMILLA = 20260926;
function crearAleatorio(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let azar = crearAleatorio(SEMILLA);

function aleatorio(min, max) {
  return Math.floor(azar() * (max - min + 1)) + min;
}

/** Fecha dentro de la jornada de hace `dias` dias; nunca queda en el futuro. */
function momento(dias, horaMin, horaMax) {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const f = new Date(base.getTime() - dias * 86400000 + aleatorio(horaMin, horaMax) * 3600000 + aleatorio(0, 59) * 60000);
  const ahora = Date.now();
  return f.getTime() > ahora ? new Date(ahora - aleatorio(10, 180) * 60000) : f;
}

/** Digito verificador del RUT chileno (modulo 11). */
function rutCompleto(numero) {
  if (!numero) return '';
  let suma = 0;
  let factor = 2;
  for (const d of String(numero).split('').reverse()) {
    suma += Number(d) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return `${numero}-${dv}`;
}

async function poblar() {
  azar = crearAleatorio(SEMILLA);

  await Promise.all([
    Usuario.deleteMany({}), Categoria.deleteMany({}), Proveedor.deleteMany({}),
    Producto.deleteMany({}), Movimiento.deleteMany({}), Transaccion.deleteMany({}),
    LogOperativo.deleteMany({}), Alerta.deleteMany({})
  ]);
  await Transaccion.syncIndexes();

  const admin = await Usuario.create({
    nombre: 'Héctor Molina Molina', email: 'admin@tecnosur.cl', rol: 'Administrador',
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
    ([sku, nombre, cat, idxProv, stock_actual, stock_critico, precio, activo]) => ({
      sku, nombre,
      id_categoria: mapaCat[cat],
      id_proveedor: proveedores[idxProv]._id,
      stock_actual, stock_critico, precio, activo
    })
  ));
  const activos = productos.filter(p => p.activo);
  const operadores = [operador, operador2, admin];

  // Movimientos manuales de los ultimos 30 dias: ajustes de inventario, mermas y
  // devoluciones. Las ventas y las compras se registran mas abajo con el carro.
  const movimientos = [];
  for (let dia = 30; dia >= 0; dia--) {
    const cuantos = aleatorio(1, 4);
    for (let k = 0; k < cuantos; k++) {
      const producto = activos[aleatorio(0, activos.length - 1)];
      const usuario = operadores[aleatorio(0, operadores.length - 1)];
      const tipo = azar() < 0.45 ? 'Entrada' : 'Salida';
      const cantidad = tipo === 'Entrada' ? aleatorio(1, 10) : aleatorio(1, 5);
      const motivos = tipo === 'Entrada' ? AJUSTES_ENTRADA : AJUSTES_SALIDA;
      movimientos.push({
        id_producto: producto._id, id_usuario: usuario._id, id_proveedor: producto.id_proveedor,
        tipo_operacion: tipo, cantidad,
        stock_resultante: Math.max(0, producto.stock_actual + (tipo === 'Entrada' ? cantidad : -cantidad)),
        observacion: motivos[aleatorio(0, motivos.length - 1)],
        fecha_timestamp: momento(dia, 8, 19)
      });
    }
  }
  await Movimiento.insertMany(movimientos);

  // Ventas y compras historicas registradas con el mismo servicio que usa la API:
  // descuentan o suman stock, generan sus movimientos y reciben folio correlativo.
  const logsComercio = [];
  const registrar = async (datos, usuario, fecha) => {
    const { transaccion } = await confirmar(datos, usuario, { fecha });
    logsComercio.push({
      id_usuario: usuario._id, email_usuario: usuario.email,
      accion: `${transaccion.tipo} confirmada ${transaccion.folio}`,
      recurso: '/api/transacciones', metodo_http: 'POST', codigo_respuesta: 201, exito: true,
      ip_origen: `190.15.${aleatorio(1, 60)}.${aleatorio(2, 250)}`,
      agente_usuario: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      fecha_timestamp: fecha
    });
    return transaccion;
  };

  // Las horas de cada jornada se sortean y se ordenan antes de registrar, para que
  // el folio correlativo siga el mismo orden que la fecha de cada operacion.
  for (let dia = 29; dia >= 1; dia--) {
    // Compra semanal de reposicion a un proveedor (solo el Administrador compra).
    if (dia % 7 === 6) {
      const proveedor = proveedores[aleatorio(0, proveedores.length - 1)];
      const suyos = activos.filter(p => String(p.id_proveedor) === String(proveedor._id));
      const elegidos = (suyos.length ? suyos : activos).slice(0, 3);
      await registrar({
        tipo: 'Compra',
        id_proveedor: proveedor._id,
        detalle: elegidos.map(p => ({
          id_producto: p._id,
          cantidad: aleatorio(8, 20),
          costo_unitario: Math.round(p.precio * 0.72 / 10) * 10
        })),
        observacion: `Factura de proveedor N.º ${aleatorio(10000, 99999)}`
      }, admin, momento(dia, 8, 8));
    }

    // Ventas de la jornada, entre las 10 y las 17 horas: de una a tres lineas por venta.
    const ventasDia = aleatorio(0, 2);
    const horas = Array.from({ length: ventasDia }, () => momento(dia, 10, 17)).sort((a, b) => a - b);
    for (let k = 0; k < ventasDia; k++) {
      const disponibles = (await Producto.find({ activo: true, stock_actual: { $gte: 6 } }).lean());
      const lineas = [];
      const usados = new Set();
      const cuantas = aleatorio(1, 3);
      while (lineas.length < cuantas && usados.size < disponibles.length) {
        const p = disponibles[aleatorio(0, disponibles.length - 1)];
        if (usados.has(String(p._id))) continue;
        usados.add(String(p._id));
        lineas.push({ id_producto: p._id, cantidad: aleatorio(1, 3) });
      }
      const [nombre, numero] = CLIENTES[aleatorio(0, CLIENTES.length - 1)];
      await registrar({
        tipo: 'Venta', detalle: lineas,
        cliente: { nombre, rut: rutCompleto(numero) }
      }, operadores[aleatorio(0, operadores.length - 1)], horas[k]);
    }
  }

  // Dos ventas corporativas recientes dejan un producto bajo el minimo y otro sin
  // stock: el catalogo muestra asi todos los estados que la operacion produce.
  const tarjeta = await Producto.findOne({ sku: 'CO-5001' }).lean();
  if (tarjeta.stock_actual > 3) {
    await registrar({
      tipo: 'Venta',
      detalle: [{ id_producto: tarjeta._id, cantidad: tarjeta.stock_actual - 3 }],
      cliente: { nombre: 'Soluciones Informáticas Pudahuel SpA', rut: rutCompleto(77105662) },
      observacion: 'Orden de compra del cliente N.º 4518'
    }, operador, momento(1, 18, 18));
  }
  const discos = await Producto.findOne({ sku: 'AL-3002' }).lean();
  if (discos.stock_actual > 0) {
    await registrar({
      tipo: 'Venta',
      detalle: [{ id_producto: discos._id, cantidad: discos.stock_actual }],
      cliente: { nombre: 'Colegio San Esteban', rut: rutCompleto(65098114) },
      observacion: 'Respaldo de los laboratorios de computación'
    }, operador2, momento(0, 9, 9));
  }

  // Telemetria historica: alimenta la coleccion append-only sobre la que
  // corre el motor analitico.
  const logs = [];
  const acciones = [
    ['Inicio de sesión', '/api/auth/login', 'POST', 200, true],
    ['Consulta de catálogo', '/api/productos', 'GET', 200, true],
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
        fecha_timestamp: momento(dia, 7, 21)
      });
    }
  }
  await LogOperativo.insertMany(logs.concat(logsComercio));

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
      descripcion: 'El usuario bodega2@tecnosur.cl intentó operar sobre /api/usuarios sin privilegios para ese recurso',
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
    transacciones: await Transaccion.countDocuments(),
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
