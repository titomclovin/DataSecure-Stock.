const LogOperativo = require('../models/LogOperativo');
const Alerta = require('../models/AlertaCiberseguridad');

/**
 * Motor analitico sobre la coleccion append-only de logs.
 * Cada regla se resuelve con un Aggregation Pipeline: el conteo ocurre dentro
 * del motor de base de datos, no en memoria del proceso Node.
 */

const VENTANA_FUERZA_BRUTA_MIN = 10;
const UMBRAL_LOGIN_FALLIDO = 5;
const VENTANA_RETIRO_MIN = 15;
const UMBRAL_UNIDADES_RETIRADAS = 100;

async function reglaFuerzaBruta(registro) {
  if (registro.exito || !registro.recurso.includes('/api/auth/login')) return null;
  const desde = new Date(Date.now() - VENTANA_FUERZA_BRUTA_MIN * 60 * 1000);
  const [agrupado] = await LogOperativo.aggregate([
    { $match: { ip_origen: registro.ip_origen, exito: false, recurso: /\/api\/auth\/login/, fecha_timestamp: { $gte: desde } } },
    { $group: { _id: '$ip_origen', intentos: { $sum: 1 }, cuentas: { $addToSet: '$email_usuario' } } }
  ]);
  if (!agrupado || agrupado.intentos < UMBRAL_LOGIN_FALLIDO) return null;
  return {
    tipo_amenaza: 'Fuerza bruta sobre credenciales',
    severidad: agrupado.intentos >= UMBRAL_LOGIN_FALLIDO * 2 ? 'Critica' : 'Alta',
    descripcion: `${agrupado.intentos} intentos de acceso fallidos desde ${registro.ip_origen} en ${VENTANA_FUERZA_BRUTA_MIN} minutos`,
    ip_origen: registro.ip_origen,
    evidencia: { intentos: agrupado.intentos, cuentas_probadas: agrupado.cuentas, ventana_min: VENTANA_FUERZA_BRUTA_MIN }
  };
}

async function reglaAccesoDenegado(registro) {
  if (registro.codigo_respuesta !== 403) return null;
  return {
    tipo_amenaza: 'Intento de acceso fuera de perfil',
    severidad: 'Media',
    descripcion: `El usuario ${registro.email_usuario} intentó operar sobre ${registro.recurso} sin privilegios para ese recurso`,
    ip_origen: registro.ip_origen,
    id_usuario: registro.id_usuario,
    evidencia: { recurso: registro.recurso, metodo: registro.metodo_http }
  };
}

/**
 * Retiro masivo: suma las unidades de salida del mismo usuario en la ventana.
 * Se calcula con $group sobre la coleccion de movimientos. Cuenta tanto las
 * salidas manuales como las ventas del carro, porque cada linea vendida deja su
 * propio movimiento de salida: una venta no es un camino para sacar stock sin
 * que la regla lo vea.
 */
async function reglaRetiroMasivo(registro) {
  const esEscrituraDeStock = registro.recurso.includes('/api/movimientos') ||
                             registro.recurso.includes('/api/transacciones');
  if (!esEscrituraDeStock || registro.metodo_http !== 'POST') return null;
  const Movimiento = require('../models/Movimiento');
  const desde = new Date(Date.now() - VENTANA_RETIRO_MIN * 60 * 1000);
  const [agrupado] = await Movimiento.aggregate([
    { $match: { id_usuario: registro.id_usuario, tipo_operacion: 'Salida', fecha_timestamp: { $gte: desde } } },
    { $group: { _id: '$id_usuario', unidades: { $sum: '$cantidad' }, operaciones: { $sum: 1 } } }
  ]);
  if (!agrupado || agrupado.unidades < UMBRAL_UNIDADES_RETIRADAS) return null;
  return {
    tipo_amenaza: 'Retiro masivo de inventario',
    severidad: 'Alta',
    descripcion: `${registro.email_usuario} retiro ${agrupado.unidades} unidades en ${agrupado.operaciones} operaciones dentro de ${VENTANA_RETIRO_MIN} minutos`,
    ip_origen: registro.ip_origen,
    id_usuario: registro.id_usuario,
    evidencia: { unidades: agrupado.unidades, operaciones: agrupado.operaciones, umbral: UMBRAL_UNIDADES_RETIRADAS }
  };
}

const REGLAS = [reglaFuerzaBruta, reglaAccesoDenegado, reglaRetiroMasivo];

const VENTANA_AGRUPACION_MIN = 30;

/**
 * Evalua el evento contra las reglas y consolida el hallazgo.
 * Un mismo ataque genera muchos eventos seguidos: en vez de abrir una alerta
 * por cada uno, se actualiza la que ya esta abierta para esa amenaza y ese
 * origen dentro de la ventana de agrupacion. Asi el panel muestra incidentes,
 * no repeticiones del mismo incidente.
 */
async function evaluarEvento(registro) {
  for (const regla of REGLAS) {
    const hallazgo = await regla(registro);
    if (!hallazgo) continue;

    const desde = new Date(Date.now() - VENTANA_AGRUPACION_MIN * 60 * 1000);
    const abierta = await Alerta.findOne({
      tipo_amenaza: hallazgo.tipo_amenaza,
      ip_origen: hallazgo.ip_origen,
      resuelta: false,
      fecha_deteccion: { $gte: desde }
    });

    if (abierta) {
      abierta.descripcion = hallazgo.descripcion;
      abierta.severidad = hallazgo.severidad;
      abierta.evidencia = hallazgo.evidencia;
      abierta.fecha_deteccion = new Date();
      await abierta.save();
      return null;
    }
    return Alerta.create(hallazgo);
  }
  return null;
}

/**
 * Indicadores del panel gerencial: todos salen de agregaciones, no de
 * recorrer documentos en el servidor de aplicaciones.
 */
async function indicadoresPanel() {
  const Producto = require('../models/Producto');
  const Movimiento = require('../models/Movimiento');
  const Transaccion = require('../models/Transaccion');

  const [inventario] = await Producto.aggregate([
    { $match: { activo: true } },
    { $group: {
        _id: null,
        articulos: { $sum: 1 },
        unidades: { $sum: '$stock_actual' },
        valorizado: { $sum: { $multiply: ['$stock_actual', '$precio'] } }
    } }
  ]);

  const criticos = await Producto.countDocuments({ activo: true, $expr: { $lte: ['$stock_actual', '$stock_critico'] } });
  const alertasAbiertas = await Alerta.countDocuments({ resuelta: false });
  const eventosHoy = await LogOperativo.countDocuments({ fecha_timestamp: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } });

  const movimientosPorDia = await Movimiento.aggregate([
    { $group: {
        _id: { dia: { $dateToString: { format: '%Y-%m-%d', date: '$fecha_timestamp' } }, tipo: '$tipo_operacion' },
        unidades: { $sum: '$cantidad' }
    } },
    { $sort: { '_id.dia': 1 } },
    { $limit: 60 }
  ]);

  const topCategorias = await Producto.aggregate([
    { $match: { activo: true } },
    { $lookup: { from: 'categorias', localField: 'id_categoria', foreignField: '_id', as: 'cat' } },
    { $unwind: '$cat' },
    { $group: { _id: '$cat.nombre_categoria', unidades: { $sum: '$stock_actual' } } },
    { $sort: { unidades: -1 } },
    { $limit: 6 }
  ]);

  // Ventas y compras del carro en las ultimas 24 horas, agrupadas por tipo.
  const comercio = await Transaccion.aggregate([
    { $match: { fecha_timestamp: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } } },
    { $group: { _id: '$tipo', operaciones: { $sum: 1 }, monto: { $sum: '$total' }, unidades: { $sum: '$unidades' } } }
  ]);
  const porTipo = tipo => {
    const g = comercio.find(c => c._id === tipo);
    return g ? { operaciones: g.operaciones, monto: g.monto, unidades: g.unidades }
             : { operaciones: 0, monto: 0, unidades: 0 };
  };

  // Productos mas vendidos en 30 dias: se despliega el detalle embebido de cada venta.
  const masVendidos = await Transaccion.aggregate([
    { $match: { tipo: 'Venta', fecha_timestamp: { $gte: new Date(Date.now() - 30 * 86400000) } } },
    { $unwind: '$detalle' },
    { $group: { _id: '$detalle.sku', nombre: { $first: '$detalle.nombre' },
                unidades: { $sum: '$detalle.cantidad' }, monto: { $sum: '$detalle.subtotal' } } },
    { $sort: { unidades: -1, monto: -1 } },
    { $limit: 6 }
  ]);

  return {
    articulos: inventario ? inventario.articulos : 0,
    unidades: inventario ? inventario.unidades : 0,
    valorizado: inventario ? Math.round(inventario.valorizado) : 0,
    criticos,
    alertas_abiertas: alertasAbiertas,
    eventos_24h: eventosHoy,
    ventas_24h: porTipo('Venta'),
    compras_24h: porTipo('Compra'),
    movimientos_por_dia: movimientosPorDia,
    top_categorias: topCategorias,
    mas_vendidos: masVendidos
  };
}

module.exports = { evaluarEvento, indicadoresPanel };
