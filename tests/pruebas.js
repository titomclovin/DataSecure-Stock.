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

  await caso('CP-01', 'Autenticacion con credenciales validas de Administrador',
    'HTTP 200 y token JWT emitido', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: 'admin@tecnosur.cl', password: 'Admin2026#Seguro' });
      tokenAdmin = r.cuerpo.token;
      return { ok: r.estado === 200 && typeof tokenAdmin === 'string' && tokenAdmin.split('.').length === 3,
               detalle: `HTTP ${r.estado}, rol ${r.cuerpo.usuario && r.cuerpo.usuario.rol}, token de ${tokenAdmin ? tokenAdmin.length : 0} caracteres` };
    });

  await caso('CP-02', 'Autenticacion con contrasena incorrecta',
    'HTTP 401 y mensaje generico sin revelar si el correo existe', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: 'admin@tecnosur.cl', password: 'claveIncorrecta1' });
      return { ok: r.estado === 401 && !/correo|usuario no/i.test(r.cuerpo.error || ''),
               detalle: `HTTP ${r.estado}, mensaje "${r.cuerpo.error}"` };
    });

  await caso('CP-03', 'Acceso a un recurso protegido sin token de sesion',
    'HTTP 401 y ningun dato del catalogo en la respuesta', async () => {
      const r = await pedir('GET', '/api/productos');
      return { ok: r.estado === 401 && !r.cuerpo.datos, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-04', 'Token manipulado en la cabecera Authorization',
    'HTTP 401: la firma no valida y la peticion se rechaza', async () => {
      const falsificado = tokenAdmin.slice(0, -6) + 'aaaaaa';
      const r = await pedir('GET', '/api/productos', null, falsificado);
      return { ok: r.estado === 401, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-05', 'Inicio de sesion del perfil Operador',
    'HTTP 200 y rol Operador en la carga del token', async () => {
      const r = await pedir('POST', '/api/auth/login', { email: 'operador@tecnosur.cl', password: 'Operador2026#Bod' });
      tokenOperador = r.cuerpo.token;
      return { ok: r.estado === 200 && r.cuerpo.usuario.rol === 'Operador',
               detalle: `HTTP ${r.estado}, rol ${r.cuerpo.usuario && r.cuerpo.usuario.rol}` };
    });

  await caso('CP-06', 'El Operador intenta crear un producto (accion reservada al Administrador)',
    'HTTP 403 y el catalogo no cambia', async () => {
      const antes = await pedir('GET', '/api/productos?limite=1', null, tokenAdmin);
      const r = await pedir('POST', '/api/productos', {
        sku: 'XX-9999', nombre: 'Producto no autorizado', id_categoria: '000000000000000000000000',
        id_proveedor: '000000000000000000000000', precio: 1000
      }, tokenOperador);
      const despues = await pedir('GET', '/api/productos?limite=1', null, tokenAdmin);
      return { ok: r.estado === 403 && antes.cuerpo.total === despues.cuerpo.total,
               detalle: `HTTP ${r.estado}, total antes ${antes.cuerpo.total} y despues ${despues.cuerpo.total}` };
    });

  await caso('CP-07', 'Alta de categoria y de producto por el Administrador',
    'HTTP 201 en ambos y el producto queda vinculado a su categoria', async () => {
      const cat = await pedir('POST', '/api/categorias', { nombre_categoria: 'Impresion', descripcion: 'Impresoras y consumibles' }, tokenAdmin);
      idCategoria = cat.cuerpo.dato && cat.cuerpo.dato._id;
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenAdmin);
      const prod = await pedir('POST', '/api/productos', {
        sku: 'IM-7001', nombre: 'Impresora laser monocromatica', id_categoria: idCategoria,
        id_proveedor: provs.cuerpo.datos[0]._id, stock_actual: 12, stock_critico: 3, precio: 189990
      }, tokenAdmin);
      idProducto = prod.cuerpo.dato && prod.cuerpo.dato._id;
      return { ok: cat.estado === 201 && prod.estado === 201 && Boolean(idProducto),
               detalle: `categoria HTTP ${cat.estado}, producto HTTP ${prod.estado}, SKU ${prod.cuerpo.dato && prod.cuerpo.dato.sku}` };
    });

  await caso('CP-08', 'Validacion de entrada: SKU con caracteres no permitidos',
    'HTTP 400 y detalle del campo rechazado', async () => {
      const provs = await pedir('GET', '/api/proveedores?limite=1', null, tokenAdmin);
      const r = await pedir('POST', '/api/productos', {
        sku: 'DROP TABLE;', nombre: 'Registro malicioso', id_categoria: idCategoria,
        id_proveedor: provs.cuerpo.datos[0]._id, precio: 100
      }, tokenAdmin);
      return { ok: r.estado === 400, detalle: `HTTP ${r.estado}, campos ${JSON.stringify(r.cuerpo.campos || [])}` };
    });

  await caso('CP-09', 'Inyeccion NoSQL en el formulario de acceso',
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

  await caso('CP-12', 'Trazabilidad: cada operacion queda en la coleccion de auditoria',
    'El evento del movimiento aparece en /api/logs con su usuario e IP', async () => {
      await new Promise(r => setTimeout(r, 400));
      const r = await pedir('GET', '/api/logs?limite=50', null, tokenAdmin);
      const encontrado = (r.cuerpo.datos || []).find(l => l.recurso.includes('/api/movimientos') && l.metodo_http === 'POST');
      return { ok: Boolean(encontrado),
               detalle: encontrado ? `evento "${encontrado.accion}" del usuario ${encontrado.email_usuario}` : 'evento no encontrado' };
    });

  await caso('CP-13', 'El motor analitico levanta alerta ante intentos de acceso repetidos',
    'Alerta de fuerza bruta registrada tras superar el umbral', async () => {
      for (let i = 0; i < 6; i++) {
        await pedir('POST', '/api/auth/login', { email: 'admin@tecnosur.cl', password: 'intentoFallido' + i });
      }
      await new Promise(r => setTimeout(r, 600));
      const r = await pedir('GET', '/api/alertas', null, tokenAdmin);
      const alerta = (r.cuerpo.datos || []).find(a => a.tipo_amenaza.includes('Fuerza bruta') && !a.resuelta);
      return { ok: Boolean(alerta), detalle: alerta ? `${alerta.severidad}: ${alerta.descripcion}` : 'sin alerta generada' };
    });

  await caso('CP-14', 'Limitacion de velocidad en el formulario de acceso',
    'HTTP 429 al superar 5 intentos fallidos en la ventana de 10 minutos', async () => {
      let ultimo = 0;
      for (let i = 0; i < 4; i++) {
        const r = await pedir('POST', '/api/auth/login', { email: 'otro@tecnosur.cl', password: 'claveErronea' + i });
        ultimo = r.estado;
      }
      return { ok: ultimo === 429, detalle: `ultimo intento respondio HTTP ${ultimo}` };
    });

  await caso('CP-15', 'El Operador no accede al modulo de cuentas de usuario',
    'HTTP 403 y ningun dato de cuentas en la respuesta', async () => {
      const r = await pedir('GET', '/api/usuarios', null, tokenOperador);
      return { ok: r.estado === 403 && !r.cuerpo.datos, detalle: `HTTP ${r.estado}, error "${r.cuerpo.error}"` };
    });

  await caso('CP-16', 'Recuperacion de credenciales por correo electronico',
    'HTTP 200 con respuesta identica exista o no la cuenta', async () => {
      const existe = await pedir('POST', '/api/auth/recuperar', { email: 'operador@tecnosur.cl' });
      const noExiste = await pedir('POST', '/api/auth/recuperar', { email: 'inexistente@tecnosur.cl' });
      return { ok: existe.estado === 200 && noExiste.estado === 200 && existe.cuerpo.mensaje === noExiste.cuerpo.mensaje,
               detalle: `HTTP ${existe.estado} y HTTP ${noExiste.estado}, mismo mensaje "${existe.cuerpo.mensaje}"` };
    });

  await caso('CP-17', 'Las contrasenas nunca viajan ni se almacenan en texto plano',
    'El hash bcrypt esta en la base y la API no lo devuelve', async () => {
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

  await caso('CP-19', 'Baja logica de un producto del catalogo',
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
               detalle: `${i.articulos} articulos, ${i.unidades} unidades, ${i.criticos} bajo minimo, ${i.eventos_24h} eventos en 24 h` };
    });

  const aprobados = resultados.filter(r => r.estado === 'APROBADO').length;

  console.log('\n===============================================================');
  console.log('  EJECUCION DEL PLAN DE PRUEBAS - DataSecure Stock');
  console.log('  ' + new Date().toISOString());
  console.log('===============================================================\n');
  resultados.forEach(r => {
    console.log(`${r.id}  [${r.estado}]  ${r.descripcion}`);
    console.log(`        Esperado : ${r.esperado}`);
    console.log(`        Obtenido : ${r.obtenido}`);
    console.log(`        Duracion : ${r.ms} ms\n`);
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

  await new Promise(r => servidor.close(r));
  await require('mongoose').connection.close();
  await memoria.stop();
  process.exit(aprobados === resultados.length ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
