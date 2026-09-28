/**
 * Suite de pruebas funcionales y de seguridad de DataSecure Stock.
 * Levanta una instancia real de MongoDB, puebla la base con el seed y ejecuta
 * los casos del plan de pruebas contra la API por HTTP. No usa dobles ni
 * simulaciones: lo que se prueba es el mismo codigo que corre en produccion.
 *
 *   node tests/pruebas.js
 */
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_SECRET = 'suite-de-pruebas-datasecure';
process.env.NODE_ENV = 'test';

const resultados = [];
let servidor, baseUrl, memoria;

function pedir(metodo, ruta, cuerpo, token) {
  return new Promise((resolve, reject) => {
    const datos = cuerpo ? JSON.stringify(cuerpo) : null;
    const url = new URL(baseUrl + ruta);
    const opciones = {
      hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: metodo,
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'User-Agent': 'suite-pruebas/1.0' },
        datos ? { 'Content-Length': Buffer.byteLength(datos) } : {},
        token ? { Authorization: 'Bearer ' + token } : {}
      )
    };
    const peticion = http.request(opciones, respuesta => {
      let bruto = '';
      respuesta.on('data', c => { bruto += c; });
      respuesta.on('end', () => {
        let json = null;
        try { json = JSON.parse(bruto); } catch (e) { json = { bruto }; }
        resolve({ estado: respuesta.statusCode, cuerpo: json });
      });
    });
    peticion.on('error', reject);
    if (datos) peticion.write(datos);
    peticion.end();
  });
}

async function caso(id, descripcion, esperado, fn) {
  const inicio = Date.now();
  try {
    const obtenido = await fn();
    const ok = obtenido.ok === true;
    resultados.push({ id, descripcion, esperado, obtenido: obtenido.detalle, estado: ok ? 'APROBADO' : 'FALLIDO', ms: Date.now() - inicio });
  } catch (e) {
    resultados.push({ id, descripcion, esperado, obtenido: 'Excepcion: ' + e.message, estado: 'FALLIDO', ms: Date.now() - inicio });
  }
}

async function main() {
  memoria = await MongoMemoryServer.create();
  process.env.MONGO_URI = memoria.getUri() + 'datasecure_stock';

  const { conectar } = require('../backend/config/db');
  const { crearApp } = require('../backend/app');
  const { poblar } = require('../backend/seed');

  await conectar();
  const resumen = await poblar();
  console.log('Base de pruebas poblada:', JSON.stringify(resumen));

  const app = crearApp();
  servidor = http.createServer(app);
  await new Promise(r => servidor.listen(0, r));
  baseUrl = 'http://127.0.0.1:' + servidor.address().port;

  let tokenAdmin = null, tokenOperador = null, idProducto = null, idCategoria = null;

  await caso('CP-01', 'Autenticación con credenciales válidas de Administrador',
    'HTTP 200 y token JWT emitido', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: 'admin@tecnosur.cl', password: 'Admin2026#Seguro' });
      tokenAdmin = r.cuerpo.token;
      return { ok: r.estado === 200 && typeof tokenAdmin === 'string' && tokenAdmin.split('.').length === 3,
               detalle: `HTTP ${r.estado}, rol ${r.cuerpo.usuario && r.cuerpo.usuario.rol}, token de ${tokenAdmin ? tokenAdmin.length : 0} caracteres` };
    });

  await caso('CP-02', 'Autenticación con contraseña incorrecta',
    'HTTP 401 y mensaje genérico sin revelar si el correo existe', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: 'admin@tecnosur.cl', password: 'claveIncorrecta1' });
      return { ok: r.estado === 401 && !/correo|usuario no/i.test(r.cuerpo.error || ''),
               detalle: `HTTP ${r.estado}, mensaje "${r.cuerpo.error}"` };
    });

  await caso('CP-03', 'Acceso a un recurso protegido sin token de sesión',
    'HTTP 401 y ningún dato del catálogo en la respuesta', async () => {
      const r = await pedir('GET', '/api/productos');
      return { ok: r.estado === 401 && !r.cuerpo.datos, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-04', 'Token manipulado en la cabecera Authorization',
    'HTTP 401: la firma no es válida y la petición se rechaza', async () => {
      const falsificado = tokenAdmin.slice(0, -6) + 'aaaaaa';
      const r = await pedir('GET', '/api/productos', null, falsificado);
      return { ok: r.estado === 401, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-05', 'Inicio de sesión del perfil Operador',
    'HTTP 200 y rol Operador en la carga del token', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: 'operador@tecnosur.cl', password: 'Operador2026#Bod' });
      tokenOperador = r.cuerpo.token;
      return { ok: r.estado === 200 && r.cuerpo.usuario.rol === 'Operador',
               detalle: `HTTP ${r.estado}, rol ${r.cuerpo.usuario && r.cuerpo.usuario.rol}` };
    });

  await caso('CP-06', 'El Operador intenta crear un producto (acción reservada al Administrador)',
    'HTTP 403 y el catálogo no cambia', async () => {
      const antes = await pedir('GET', '/api/productos?limite=1', null, tokenAdmin);
      const r = await pedir('POST', '/api/productos', {
        sku: 'XX-9999', nombre: 'Producto no autorizado', id_categoria: '000000000000000000000000',
        id_proveedor: '000000000000000000000000', precio: 1000
      }, tokenOperador);
      const despues = await pedir('GET', '/api/productos?limite=1', null, tokenAdmin);
      return { ok: r.estado === 403 && antes.cuerpo.total === despues.cuerpo.total,
               detalle: `HTTP ${r.estado}, total antes ${antes.cuerpo.total} y después ${despues.cuerpo.total}` };
    });

  await caso('CP-07', 'Alta de categoría y de producto por el Administrador',
    'HTTP 201 en ambos y el producto queda vinculado a su categoría', async () => {
      const cat = await pedir('POST', '/api/categorias', { nombre_categoria: 'Impresion', descripcion: 'Impresoras y consumibles' }, tokenAdmin);
      idCategoria = cat.cuerpo.dato && cat.cuerpo.dato._id;
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenAdmin);
      const prod = await pedir('POST', '/api/productos', {
        sku: 'IM-7001', nombre: 'Impresora láser monocromática', id_categoria: idCategoria,
        id_proveedor: provs.cuerpo.datos[0]._id, stock_actual: 12, stock_critico: 3, precio: 189990
      }, tokenAdmin);
      idProducto = prod.cuerpo.dato && prod.cuerpo.dato._id;
      return { ok: cat.estado === 201 && prod.estado === 201 && Boolean(idProducto),
               detalle: `categoría HTTP ${cat.estado}, producto HTTP ${prod.estado}, SKU ${prod.cuerpo.dato && prod.cuerpo.dato.sku}` };
    });

  await caso('CP-08', 'Validación de entrada: SKU con caracteres no permitidos',
    'HTTP 400 y detalle del campo rechazado', async () => {
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenAdmin);
      const r = await pedir('POST', '/api/productos', {
        sku: 'DROP TABLE;', nombre: 'Registro malicioso', id_categoria: idCategoria,
        id_proveedor: provs.cuerpo.datos[0]._id, precio: 100
      }, tokenAdmin);
      return { ok: r.estado === 400, detalle: `HTTP ${r.estado}, campos ${JSON.stringify(r.cuerpo.campos || [])}` };
    });

  await caso('CP-09', 'Inyección NoSQL en el formulario de acceso',
    'HTTP 400 o 401: el operador $ne no se interpreta como consulta', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: { $ne: null }, password: { $ne: null } });
      return { ok: r.estado === 400 || r.estado === 401, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-10', 'Registro de entrada de stock por el Operador',
    'HTTP 201 y el stock del producto sube exactamente la cantidad ingresada', async () => {
      const antes = await pedir('GET', '/api/productos/' + idProducto, null, tokenOperador);
      const r = await pedir('POST', '/api/movimientos',
        { id_producto: idProducto, tipo_operacion: 'Entrada', cantidad: 20, observacion: 'Recepcion OC 4471' }, tokenOperador);
      const despues = await pedir('GET', '/api/productos/' + idProducto, null, tokenOperador);
      const esperado = antes.cuerpo.dato.stock_actual + 20;
      return { ok: r.estado === 201 && despues.cuerpo.dato.stock_actual === esperado,
               detalle: `HTTP ${r.estado}, stock ${antes.cuerpo.dato.stock_actual} -> ${despues.cuerpo.dato.stock_actual}` };
    });

  await caso('CP-11', 'Salida de stock mayor a las existencias disponibles',
    'HTTP 409 y el stock permanece sin cambios', async () => {
      const antes = await pedir('GET', '/api/productos/' + idProducto, null, tokenOperador);
      const r = await pedir('POST', '/api/movimientos',
        { id_producto: idProducto, tipo_operacion: 'Salida', cantidad: 9999 }, tokenOperador);
      const despues = await pedir('GET', '/api/productos/' + idProducto, null, tokenOperador);
      return { ok: r.estado === 409 && antes.cuerpo.dato.stock_actual === despues.cuerpo.dato.stock_actual,
               detalle: `HTTP ${r.estado}, stock se mantuvo en ${despues.cuerpo.dato.stock_actual}` };
    });

  await caso('CP-12', 'Trazabilidad: cada operación queda en la colección de auditoría',
    'El evento del movimiento aparece en /api/logs con su usuario e IP', async () => {
      await new Promise(r => setTimeout(r, 400));
      const r = await pedir('GET', '/api/logs?limite=50', null, tokenAdmin);
      const encontrado = (r.cuerpo.datos || []).find(l => l.recurso.includes('/api/movimientos') && l.metodo_http === 'POST');
      return { ok: Boolean(encontrado),
               detalle: encontrado ? `evento "${encontrado.accion}" del usuario ${encontrado.email_usuario}` : 'evento no encontrado' };
    });

  await caso('CP-13', 'El motor analítico levanta alerta ante intentos de acceso repetidos',
    'Alerta de fuerza bruta registrada tras superar el umbral', async () => {
      for (let i = 0; i < 6; i++) {
        await pedir('POST', '/api/auth/login', { email: 'admin@tecnosur.cl', password: 'intentoFallido' + i });
      }
      await new Promise(r => setTimeout(r, 600));
      const r = await pedir('GET', '/api/alertas', null, tokenAdmin);
      const alerta = (r.cuerpo.datos || []).find(a => a.tipo_amenaza.includes('Fuerza bruta') && !a.resuelta);
      return { ok: Boolean(alerta), detalle: alerta ? `${alerta.severidad}: ${alerta.descripcion}` : 'sin alerta generada' };
    });

  await caso('CP-14', 'Limitación de velocidad en el formulario de acceso',
    'HTTP 429 al superar 5 intentos fallidos en la ventana de 10 minutos', async () => {
      let ultimo = 0;
      for (let i = 0; i < 4; i++) {
        const r = await pedir('POST', '/api/auth/login', { email: 'otro@tecnosur.cl', password: 'claveErronea' + i });
        ultimo = r.estado;
      }
      return { ok: ultimo === 429, detalle: `último intento respondió HTTP ${ultimo}` };
    });

  await caso('CP-15', 'El Operador no accede al módulo de cuentas de usuario',
    'HTTP 403 y ningún dato de cuentas en la respuesta', async () => {
      const r = await pedir('GET', '/api/usuarios', null, tokenOperador);
      return { ok: r.estado === 403 && !r.cuerpo.datos, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-16', 'Recuperación de credenciales por correo electrónico',
    'HTTP 200 con respuesta idéntica exista o no la cuenta', async () => {
      const existe = await pedir('POST', '/api/auth/recuperar', { email: 'operador@tecnosur.cl' });
      const noExiste = await pedir('POST', '/api/auth/recuperar', { email: 'inexistente@tecnosur.cl' });
      return { ok: existe.estado === 200 && noExiste.estado === 200 && existe.cuerpo.mensaje === noExiste.cuerpo.mensaje,
               detalle: `HTTP ${existe.estado} y HTTP ${noExiste.estado}, mismo mensaje "${existe.cuerpo.mensaje}"` };
    });

  await caso('CP-17', 'Las contraseñas nunca viajan ni se almacenan en texto plano',
    'El hash bcrypt está en la base y la API no lo devuelve', async () => {
      const Usuario = require('../backend/models/Usuario');
      const doc = await Usuario.findOne({ email: 'admin@tecnosur.cl' }).select('+password_hash').lean();
      const api = await pedir('GET', '/api/usuarios', null, tokenAdmin);
      const enApi = JSON.stringify(api.cuerpo).includes('password_hash');
      return { ok: /^\$2[aby]\$\d{2}\$/.test(doc.password_hash) && !enApi,
               detalle: `hash almacenado ${doc.password_hash.slice(0, 7)}... (${doc.password_hash.length} caracteres), la API no expone el campo` };
    });

  await caso('CP-18', 'Cabeceras de seguridad HTTP entregadas por Helmet',
    'Presencia de Content-Security-Policy y ausencia de X-Powered-By', async () => {
      const cabeceras = await new Promise((resolve, reject) => {
        http.get(baseUrl + '/api/health', res => { res.resume(); resolve(res.headers); }).on('error', reject);
      });
      return { ok: Boolean(cabeceras['content-security-policy']) && !cabeceras['x-powered-by'],
               detalle: `CSP presente, X-Powered-By ${cabeceras['x-powered-by'] ? 'expuesto' : 'ausente'}, HSTS ${cabeceras['strict-transport-security'] ? 'activo' : 'ausente'}` };
    });

  await caso('CP-19', 'Baja lógica de un producto del catálogo',
    'HTTP 200, el registro conserva su historial y queda marcado como inactivo', async () => {
      const r = await pedir('DELETE', '/api/productos/' + idProducto, null, tokenAdmin);
      const verificacion = await pedir('GET', '/api/productos/' + idProducto, null, tokenAdmin);
      return { ok: r.estado === 200 && verificacion.cuerpo.dato.activo === false,
               detalle: `HTTP ${r.estado}, campo activo = ${verificacion.cuerpo.dato.activo}` };
    });

  await caso('CP-20', 'Panel gerencial calculado con agregaciones sobre la base',
    'Indicadores coherentes con el contenido real de las colecciones', async () => {
      const r = await pedir('GET', '/api/panel', null, tokenAdmin);
      const i = r.cuerpo.indicadores;
      return { ok: r.estado === 200 && i.articulos > 0 && i.unidades > 0 && i.eventos_24h > 0,
               detalle: `${i.articulos} artículos, ${i.unidades} unidades, ${i.criticos} bajo mínimo, ${i.eventos_24h} eventos en 24 h` };
    });

  /* ------------------------------------------------ carro de compra y venta */
  const stockDe = async (id) => (await pedir('GET', '/api/productos/' + id, null, tokenAdmin)).cuerpo.dato.stock_actual;
  const Movimiento = require('../backend/models/Movimiento');
  let vendidos = [];
  let folioVenta = null;

  await caso('CP-21', 'Venta de dos productos desde el carro por el Operador',
    'HTTP 201, folio V correlativo, stock de cada línea descontado exactamente y total igual a neto más IVA', async () => {
      const lista = await pedir('GET', '/api/productos?limite=100&activo=true', null, tokenOperador);
      vendidos = lista.cuerpo.datos.filter(p => p.stock_actual >= 10).slice(0, 2);
      const [a, b] = vendidos;
      const r = await pedir('POST', '/api/transacciones', {
        tipo: 'Venta',
        detalle: [{ id_producto: a._id, cantidad: 2 }, { id_producto: b._id, cantidad: 1 }],
        cliente: { nombre: 'Comercial Los Aromos Ltda.', rut: '76412338-7' }
      }, tokenOperador);
      const t = r.cuerpo.dato || {};
      folioVenta = t.folio;
      const [sa, sb] = [await stockDe(a._id), await stockDe(b._id)];
      const esperado = a.precio * 2 + b.precio;
      const ok = r.estado === 201 && /^V-\d{6}$/.test(t.folio || '') &&
                 sa === a.stock_actual - 2 && sb === b.stock_actual - 1 &&
                 t.total === esperado && t.neto + t.iva === t.total;
      return { ok, detalle: `HTTP ${r.estado}, folio ${t.folio}, stock ${a.sku} ${a.stock_actual} -> ${sa} y ` +
                            `${b.sku} ${b.stock_actual} -> ${sb}, total ${t.total} = neto ${t.neto} + IVA ${t.iva}` };
    });

  await caso('CP-22', 'El navegador envía un precio manipulado en una línea del carro',
    'HTTP 201 y el comprobante aplica el precio del catálogo, no el enviado', async () => {
      const p = vendidos[0];
      const r = await pedir('POST', '/api/transacciones', {
        tipo: 'Venta', total: 1,
        detalle: [{ id_producto: p._id, cantidad: 1, precio_unitario: 1, subtotal: 1 }]
      }, tokenOperador);
      const linea = r.cuerpo.dato ? r.cuerpo.dato.detalle[0] : {};
      return { ok: r.estado === 201 && linea.precio_unitario === p.precio && r.cuerpo.dato.total === p.precio,
               detalle: `HTTP ${r.estado}, precio enviado 1, precio aplicado ${linea.precio_unitario} (catálogo ${p.precio})` };
    });

  await caso('CP-23', 'Venta con una línea válida y otra sin stock suficiente',
    'HTTP 409 y ninguna existencia cambia: el carro se aplica completo o no se aplica', async () => {
      const [a, b] = vendidos;
      const antes = [await stockDe(a._id), await stockDe(b._id)];
      const r = await pedir('POST', '/api/transacciones', {
        tipo: 'Venta', detalle: [{ id_producto: a._id, cantidad: 1 }, { id_producto: b._id, cantidad: 9999 }]
      }, tokenOperador);
      const despues = [await stockDe(a._id), await stockDe(b._id)];
      return { ok: r.estado === 409 && antes[0] === despues[0] && antes[1] === despues[1],
               detalle: `HTTP ${r.estado}, "${r.cuerpo.error}", stock ${a.sku} ${antes[0]} -> ${despues[0]} y ${b.sku} ${antes[1]} -> ${despues[1]}` };
    });

  await caso('CP-24', 'Dos ventas simultáneas compiten por las últimas unidades de un producto',
    'Una se confirma, la otra recibe 409, se revierte su línea ya aplicada y ningún stock queda negativo', async () => {
      const cats = await pedir('GET', '/api/categorias?limite=1', null, tokenAdmin);
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenAdmin);
      const nuevo = await pedir('POST', '/api/productos', {
        sku: 'RE-9901', nombre: 'Adaptador de red USB-C a RJ45', id_categoria: cats.cuerpo.datos[0]._id,
        id_proveedor: provs.cuerpo.datos[0]._id, stock_actual: 3, stock_critico: 1, precio: 19990
      }, tokenAdmin);
      const escaso = nuevo.cuerpo.dato._id;
      const otro = vendidos[1];
      const otroAntes = await stockDe(otro._id);
      // La linea del otro producto va primero: la venta que pierde alcanza a aplicarla y debe revertirla.
      const cuerpo = { tipo: 'Venta', detalle: [{ id_producto: otro._id, cantidad: 1 }, { id_producto: escaso, cantidad: 2 }] };
      const [r1, r2] = await Promise.all([
        pedir('POST', '/api/transacciones', cuerpo, tokenOperador),
        pedir('POST', '/api/transacciones', cuerpo, tokenAdmin)
      ]);
      const codigos = [r1.estado, r2.estado].sort();
      const escasoDespues = await stockDe(escaso);
      const otroDespues = await stockDe(otro._id);
      return { ok: codigos[0] === 201 && codigos[1] === 409 && escasoDespues === 1 && otroDespues === otroAntes - 1,
               detalle: `respuestas HTTP ${r1.estado} y HTTP ${r2.estado}; RE-9901 3 -> ${escasoDespues}; ` +
                        `${otro.sku} ${otroAntes} -> ${otroDespues} (solo la venta confirmada)` };
    });

  await caso('CP-25', 'Compra a un proveedor desde el carro por el Administrador',
    'HTTP 201, folio C, stock sumado y un movimiento de Entrada enlazado al folio por cada línea', async () => {
      const p = vendidos[0];
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenAdmin);
      const antes = await stockDe(p._id);
      const r = await pedir('POST', '/api/transacciones', {
        tipo: 'Compra', id_proveedor: provs.cuerpo.datos[0]._id,
        detalle: [{ id_producto: p._id, cantidad: 15, costo_unitario: Math.round(p.precio * 0.7) }],
        observacion: 'Factura de proveedor 88123'
      }, tokenAdmin);
      const t = r.cuerpo.dato || {};
      const despues = await stockDe(p._id);
      const movs = t._id ? await Movimiento.find({ id_transaccion: t._id }).lean() : [];
      const enlazados = movs.length === 1 && movs[0].tipo_operacion === 'Entrada' && movs[0].observacion === `Compra ${t.folio}`;
      return { ok: r.estado === 201 && /^C-\d{6}$/.test(t.folio || '') && despues === antes + 15 && enlazados,
               detalle: `HTTP ${r.estado}, folio ${t.folio}, stock ${p.sku} ${antes} -> ${despues}, ` +
                        `${movs.length} movimiento de ${movs[0] ? movs[0].tipo_operacion : '-'} con la observación "${movs[0] ? movs[0].observacion : ''}"` };
    });

  await caso('CP-26', 'El Operador intenta registrar una compra a proveedor',
    'HTTP 403, el stock no cambia y el motor analítico registra el intento fuera de perfil', async () => {
      const p = vendidos[0];
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenOperador);
      const antes = await stockDe(p._id);
      const r = await pedir('POST', '/api/transacciones', {
        tipo: 'Compra', id_proveedor: provs.cuerpo.datos[0]._id, detalle: [{ id_producto: p._id, cantidad: 50 }]
      }, tokenOperador);
      await new Promise(res => setTimeout(res, 500));
      const despues = await stockDe(p._id);
      const alertas = await pedir('GET', '/api/alertas?resuelta=false', null, tokenAdmin);
      const alerta = (alertas.cuerpo.datos || []).find(a => a.tipo_amenaza.includes('fuera de perfil') &&
                                                           a.descripcion.includes('/api/transacciones'));
      return { ok: r.estado === 403 && antes === despues && Boolean(alerta),
               detalle: `HTTP ${r.estado}, "${r.cuerpo.error}", stock ${antes} -> ${despues}, alerta: ${alerta ? alerta.severidad + ' ' + alerta.tipo_amenaza : 'no generada'}` };
    });

  await caso('CP-27', 'Venta de un producto dado de baja',
    'HTTP 409: un producto inactivo no se puede vender', async () => {
      const r = await pedir('POST', '/api/transacciones', {
        tipo: 'Venta', detalle: [{ id_producto: idProducto, cantidad: 1 }]
      }, tokenOperador);
      return { ok: r.estado === 409 && /inactivo/i.test(r.cuerpo.error || ''), detalle: `HTTP ${r.estado}, "${r.cuerpo.error}"` };
    });

  await caso('CP-28', 'Reactivación de un producto dado de baja',
    'HTTP 200, el producto vuelve a estar activo y se puede vender otra vez', async () => {
      const r = await pedir('PUT', '/api/productos/' + idProducto + '/reactivar', null, tokenAdmin);
      const venta = await pedir('POST', '/api/transacciones', {
        tipo: 'Venta', detalle: [{ id_producto: idProducto, cantidad: 1 }]
      }, tokenOperador);
      return { ok: r.estado === 200 && r.cuerpo.dato.activo === true && venta.estado === 201,
               detalle: `HTTP ${r.estado}, activo = ${r.cuerpo.dato && r.cuerpo.dato.activo}; venta posterior HTTP ${venta.estado} con folio ${venta.cuerpo.dato && venta.cuerpo.dato.folio}` };
    });

  await caso('CP-29', 'Trazabilidad de la venta: historial, movimientos, bitácora y panel',
    'La venta aparece en el historial del Operador, sus líneas en movimientos, su evento en la bitácora y en el panel', async () => {
      await new Promise(res => setTimeout(res, 400));
      const hist = await pedir('GET', '/api/transacciones?tipo=Venta&limite=100', null, tokenOperador);
      const propia = (hist.cuerpo.datos || []).find(t => t.folio === folioVenta);
      const soloPropias = (hist.cuerpo.datos || []).every(t => t.id_usuario && t.id_usuario.email === 'operador@tecnosur.cl');
      const movs = await Movimiento.countDocuments({ observacion: `Venta ${folioVenta}` });
      const logs = await pedir('GET', '/api/logs?limite=200', null, tokenAdmin);
      const evento = (logs.cuerpo.datos || []).find(l => l.accion === `Venta confirmada ${folioVenta}`);
      const panel = await pedir('GET', '/api/panel', null, tokenAdmin);
      const v = panel.cuerpo.indicadores.ventas_24h;
      return { ok: Boolean(propia) && soloPropias && movs === 2 && Boolean(evento) && v.operaciones > 0,
               detalle: `folio ${folioVenta} en el historial (${hist.cuerpo.total} ventas propias), ${movs} movimientos de salida, ` +
                        `evento "${evento ? evento.accion : '-'}", panel: ${v.operaciones} ventas por ${v.monto} en 24 h` };
    });

  await caso('CP-30', 'Validación del carro: sin líneas o con cantidad cero',
    'HTTP 400 con el detalle de los campos rechazados, sin tocar el stock', async () => {
      const vacio = await pedir('POST', '/api/transacciones', { tipo: 'Venta', detalle: [] }, tokenOperador);
      const cero = await pedir('POST', '/api/transacciones', {
        tipo: 'Venta', detalle: [{ id_producto: vendidos[0]._id, cantidad: 0 }]
      }, tokenOperador);
      return { ok: vacio.estado === 400 && cero.estado === 400,
               detalle: `carro vacío HTTP ${vacio.estado}, cantidad cero HTTP ${cero.estado}: ${JSON.stringify((cero.cuerpo.campos || []).map(c => c.detalle))}` };
    });

  const aprobados = resultados.filter(r => r.estado === 'APROBADO').length;

  console.log('\n===============================================================');
  console.log('  EJECUCIÓN DEL PLAN DE PRUEBAS - DataSecure Stock');
  console.log('  ' + new Date().toISOString());
  console.log('===============================================================\n');
  resultados.forEach(r => {
    console.log(`${r.id}  [${r.estado}]  ${r.descripcion}`);
    console.log(`        Esperado : ${r.esperado}`);
    console.log(`        Obtenido : ${r.obtenido}`);
    console.log(`        Duración : ${r.ms} ms\n`);
  });
  console.log('---------------------------------------------------------------');
  console.log(`RESULTADO: ${aprobados} de ${resultados.length} casos aprobados ` +
              `(${Math.round(aprobados / resultados.length * 100)} por ciento)`);
  console.log('---------------------------------------------------------------');

  require('fs').writeFileSync(
    require('path').join(__dirname, 'resultado_pruebas.json'),
    JSON.stringify({ fecha: new Date().toISOString(), total: resultados.length, aprobados, casos: resultados }, null, 2),
    'utf8'
  );

  // La auditoria se escribe al terminar cada respuesta: se espera la ultima antes de cerrar.
  await new Promise(r => setTimeout(r, 600));
  await new Promise(r => servidor.close(r));
  await require('mongoose').connection.close();
  await memoria.stop();
  process.exit(aprobados === resultados.length ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
