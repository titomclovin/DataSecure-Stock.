/* Carro de compra y venta.
   El carro vive en la sesion del navegador; al confirmar, el servidor vuelve a
   validar cada linea, fija el precio de venta desde el catalogo y aplica todas
   las lineas o ninguna. */

const usuario = Sesion.exigir(['Administrador', 'Operador']);
montarNavegacion('carro.html');

const esAdmin = usuario.rol === 'Administrador';
const TASA_IVA = 0.19;
const $ = id => document.getElementById(id);

let carro = CarroSesion.leer();
if (!esAdmin) carro.modo = 'Venta';
let catalogo = [];

function guardar() { CarroSesion.guardar(carro); }

function esCompra() { return carro.modo === 'Compra'; }

/* En la compra se usa el costo informado; en la venta, el precio del catalogo. */
function precioLinea(l) {
  if (esCompra() && l.costo !== null && l.costo !== undefined) return l.costo;
  return l.precio;
}

function totales() {
  const total = carro.lineas.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);
  const neto = Math.round(total / (1 + TASA_IVA));
  return { unidades: carro.lineas.reduce((s, l) => s + l.cantidad, 0), total, neto, iva: total - neto };
}

/* ------------------------------------------------------------ modo */
function pintarModo() {
  $('modo-compra').hidden = !esAdmin;
  document.querySelectorAll('.modo').forEach(b => {
    const activo = b.dataset.modo === carro.modo;
    b.classList.toggle('activo', activo);
    b.setAttribute('aria-pressed', String(activo));
  });
  const compra = esCompra();
  $('campos-venta').hidden = compra;
  $('campos-compra').hidden = !compra;
  $('th-unitario').textContent = compra ? 'Costo unit.' : 'Precio unit.';
  $('btn-confirmar').textContent = compra ? 'Confirmar compra' : 'Confirmar venta';
  $('pie-carro').textContent = compra
    ? 'Costo unitario con IVA incluido, según la factura del proveedor. La compra suma stock a cada artículo.'
    : 'Precios con IVA incluido. En la venta el precio lo fija el catálogo al confirmar.';
}

/* ------------------------------------------------------------ carro */
function pintarCarro() {
  const cuerpo = $('tb-carro');
  const compra = esCompra();
  let excede = false;

  cuerpo.innerHTML = carro.lineas.length ? carro.lineas.map((l, i) => {
    const sobre = !compra && l.cantidad > l.stock;
    if (sobre) excede = true;
    const tope = !compra && l.cantidad >= l.stock;
    const unitario = compra
      ? `<input type="number" class="entrada-costo" min="0" step="10" value="${txt(precioLinea(l))}"
           data-costo="${i}" aria-label="Costo unitario de ${txt(l.sku)}">`
      : dinero(l.precio);
    return `<tr${sobre ? ' class="fila-excede"' : ''}>
      <td><strong>${txt(l.sku)}</strong><span class="detalle-linea">${txt(l.nombre)}</span>
        ${sobre ? `<span class="detalle-linea texto-peligro">Solo hay ${entero(l.stock)} en stock</span>` : ''}</td>
      <td class="numero"><div class="control-cantidad">
        <button type="button" class="boton-menor boton-secundario" data-menos="${i}" aria-label="Restar una unidad">-</button>
        <input type="number" min="1" max="10000" value="${l.cantidad}" data-cantidad="${i}" aria-label="Cantidad de ${txt(l.sku)}">
        <button type="button" class="boton-menor boton-secundario" data-mas="${i}" ${tope ? 'disabled' : ''} aria-label="Sumar una unidad">+</button>
      </div></td>
      <td class="numero" data-etiqueta="${compra ? 'Costo unit.' : 'Precio unit.'}">${unitario}</td>
      <td class="numero" data-etiqueta="Subtotal">${dinero(precioLinea(l) * l.cantidad)}</td>
      <td><button type="button" class="boton-menor boton-peligro" data-quitar="${i}" aria-label="Quitar ${txt(l.sku)}">Quitar</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="vacio">El carro está vacío. Agregue artículos desde la lista.</td></tr>';

  const t = totales();
  $('t-unidades').textContent = entero(t.unidades);
  $('t-neto').textContent = dinero(t.neto);
  $('t-iva').textContent = dinero(t.iva);
  $('t-total').textContent = dinero(t.total);
  $('contador').textContent = entero(t.unidades);
  $('btn-confirmar').disabled = !carro.lineas.length || excede;
  $('btn-vaciar').disabled = !carro.lineas.length;

  cuerpo.querySelectorAll('[data-menos]').forEach(b => b.addEventListener('click', () => cambiar(+b.dataset.menos, -1)));
  cuerpo.querySelectorAll('[data-mas]').forEach(b => b.addEventListener('click', () => cambiar(+b.dataset.mas, 1)));
  cuerpo.querySelectorAll('[data-cantidad]').forEach(e => e.addEventListener('change', () => fijar(+e.dataset.cantidad, e.value)));
  cuerpo.querySelectorAll('[data-costo]').forEach(e => e.addEventListener('change', () => fijarCosto(+e.dataset.costo, e.value)));
  cuerpo.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => quitar(+b.dataset.quitar)));
}

function cambiar(i, delta) {
  const l = carro.lineas[i];
  l.cantidad = Math.max(1, Math.min(10000, l.cantidad + delta));
  guardar(); pintarCarro();
}

function fijar(i, valor) {
  const n = parseInt(valor, 10);
  carro.lineas[i].cantidad = Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : 1;
  guardar(); pintarCarro();
}

function fijarCosto(i, valor) {
  const n = Number(valor);
  carro.lineas[i].costo = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  guardar(); pintarCarro();
}

function quitar(i) {
  carro.lineas.splice(i, 1);
  guardar(); pintarCarro(); pintarCatalogo();
}

/* Al abrir la pagina se consulta cada linea: el stock y el precio del carro
   quedan al dia y sale del carro lo que se dio de baja entretanto. */
async function refrescarLineas() {
  const consultas = await Promise.all(carro.lineas.map(l =>
    pedir('/productos/' + l.id).then(r => r.dato).catch(() => null)));
  const vivas = [];
  carro.lineas.forEach((l, i) => {
    const p = consultas[i];
    if (p && p.activo) {
      l.stock = p.stock_actual; l.precio = p.precio; l.nombre = p.nombre;
      vivas.push(l);
    }
  });
  const retirados = carro.lineas.length - vivas.length;
  carro.lineas = vivas;
  guardar();
  if (retirados) {
    mostrarAviso('aviso', `${retirados} artículo(s) del carro ya no están disponibles y se retiraron.`, 'aviso-info');
  }
}

/* ------------------------------------------------------------ catalogo */
async function cargarCatalogo() {
  const buscar = $('c-buscar').value.trim();
  try {
    const r = await pedir(`/productos?limite=8&activo=true${buscar ? '&buscar=' + encodeURIComponent(buscar) : ''}`);
    catalogo = r.datos;
    carro.lineas.forEach(l => {
      const p = catalogo.find(x => x._id === l.id);
      if (p) { l.stock = p.stock_actual; l.precio = p.precio; }
    });
    guardar();
    pintarCatalogo();
    pintarCarro();
    $('c-paginacion').textContent = r.total > r.datos.length
      ? `Se muestran ${r.datos.length} de ${r.total} artículos activos; use el buscador para encontrar otros.`
      : `${r.total} artículos activos`;
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  }
}

function pintarCatalogo() {
  const compra = esCompra();
  const cuerpo = $('tb-catalogo');
  cuerpo.innerHTML = catalogo.length ? catalogo.map(p => {
    const e = estadoProducto(p);
    const agotado = !compra && p.stock_actual === 0;
    return `<tr>
      <td class="sku">${txt(p.sku)}</td>
      <td>${txt(p.nombre)}</td>
      <td class="numero">${entero(p.stock_actual)}</td>
      <td class="numero">${dinero(p.precio)}</td>
      <td><span class="marca-estado ${e.clase}">${e.texto}</span></td>
      <td><button type="button" class="boton-menor" data-agregar="${txt(p._id)}" ${agotado ? 'disabled' : ''}>${agotado ? 'Sin stock' : 'Agregar'}</button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="vacio">Sin resultados</td></tr>';

  cuerpo.querySelectorAll('[data-agregar]').forEach(b => b.addEventListener('click', () => {
    const p = catalogo.find(x => x._id === b.dataset.agregar);
    CarroSesion.agregar(p);
    carro = CarroSesion.leer();
    if (!esAdmin) carro.modo = 'Venta';
    pintarCarro();
    mostrarAviso('aviso', `${p.sku} agregado al carro.`, 'aviso-ok');
  }));
}

/* ------------------------------------------------------------ confirmar */
$('form-carro').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const compra = esCompra();
  const rut = $('c-rut').value.trim();
  if (!compra && rut && !/^\d{7,8}-[\dkK]$/.test(rut)) {
    mostrarAviso('aviso', 'El RUT debe escribirse sin puntos y con guion, por ejemplo 76543210-9.', 'aviso-error');
    return;
  }
  if (compra && !$('c-proveedor').value) {
    mostrarAviso('aviso', 'Seleccione el proveedor de la compra.', 'aviso-error');
    return;
  }

  const cuerpo = {
    tipo: carro.modo,
    detalle: carro.lineas.map(l => compra
      ? { id_producto: l.id, cantidad: l.cantidad, costo_unitario: precioLinea(l) }
      : { id_producto: l.id, cantidad: l.cantidad }),
    observacion: $('c-obs').value.trim()
  };
  if (compra) cuerpo.id_proveedor = $('c-proveedor').value;
  else cuerpo.cliente = { nombre: $('c-cliente').value.trim(), rut };

  const boton = $('btn-confirmar');
  boton.disabled = true;
  try {
    const r = await pedir('/transacciones', { method: 'POST', body: JSON.stringify(cuerpo) });
    CarroSesion.vaciar();
    carro = CarroSesion.leer();
    ['c-cliente', 'c-rut', 'c-obs'].forEach(id => { $(id).value = ''; });
    mostrarAviso('aviso',
      `${r.dato.tipo} ${r.dato.folio} confirmada: ${entero(r.dato.unidades)} unidades, total ${dinero(r.dato.total)}. El stock ya quedó actualizado.`,
      'aviso-ok');
    mostrarComprobante(r.dato);
    await Promise.all([cargarCatalogo(), cargarHistorial()]);
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
    await refrescarLineas();
    await cargarCatalogo();
  } finally {
    pintarCarro();
  }
});

$('btn-vaciar').addEventListener('click', () => {
  CarroSesion.vaciar();
  carro = CarroSesion.leer();
  pintarCarro(); pintarCatalogo();
});

document.querySelectorAll('.modo').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.modo === 'Compra' && !esAdmin) return;
  carro.modo = b.dataset.modo;
  guardar(); pintarModo(); pintarCarro(); pintarCatalogo();
}));

/* ------------------------------------------------------------ comprobante */
function mostrarComprobante(t) {
  const compra = t.tipo === 'Compra';
  const responsable = t.id_usuario && t.id_usuario.nombre ? t.id_usuario.nombre : usuario.nombre;
  const proveedor = t.razon_social || (t.id_proveedor && t.id_proveedor.razon_social) || '';
  const contraparte = compra
    ? `<div><dt>Proveedor</dt><dd>${txt(proveedor)}</dd></div>`
    : `<div><dt>Cliente</dt><dd>${txt(t.cliente.nombre)}${t.cliente.rut ? ' - RUT ' + txt(t.cliente.rut) : ''}</dd></div>`;

  $('comp-titulo').textContent = `${compra ? 'Compra a proveedor' : 'Venta'} ${t.folio}`;
  $('comprobante').innerHTML = `
    <dl class="datos-comprobante">
      <div><dt>Folio</dt><dd>${txt(t.folio)}</dd></div>
      <div><dt>Fecha</dt><dd>${txt(fecha(t.fecha_timestamp))}</dd></div>
      ${contraparte}
      <div><dt>Responsable</dt><dd>${txt(responsable)}</dd></div>
    </dl>
    <div class="tabla-envoltura">
      <table class="tabla-comprobante">
        <thead><tr><th>SKU</th><th>Producto</th><th class="numero">Cant.</th>
          <th class="numero">${compra ? 'Costo unit.' : 'Precio unit.'}</th><th class="numero">Subtotal</th>
          <th class="numero">Stock final</th></tr></thead>
        <tbody>${t.detalle.map(l => `<tr>
          <td>${txt(l.sku)}</td><td>${txt(l.nombre)}</td><td class="numero">${entero(l.cantidad)}</td>
          <td class="numero">${dinero(l.precio_unitario)}</td><td class="numero">${dinero(l.subtotal)}</td>
          <td class="numero">${entero(l.stock_resultante)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <dl class="totales">
      <div><dt>Neto</dt><dd>${dinero(t.neto)}</dd></div>
      <div><dt>IVA 19 %</dt><dd>${dinero(t.iva)}</dd></div>
      <div class="total"><dt>Total</dt><dd>${dinero(t.total)}</dd></div>
    </dl>
    ${t.observacion ? `<p class="pie-carro">Observación: ${txt(t.observacion)}</p>` : ''}
    <p class="pie-carro">Comprobante interno de control de inventario. No reemplaza la boleta ni la factura electrónica.</p>`;
  $('dlg-comprobante').showModal();
}

$('btn-cerrar-comp').addEventListener('click', () => $('dlg-comprobante').close());
$('btn-imprimir').addEventListener('click', () => {
  document.body.classList.add('imprimiendo');
  window.print();
  document.body.classList.remove('imprimiendo');
});

/* ------------------------------------------------------------ historial */
async function cargarHistorial() {
  const tipo = $('h-tipo').value;
  try {
    const r = await pedir('/transacciones?limite=8' + (tipo ? '&tipo=' + tipo : ''));
    const cuerpo = $('tb-historial');
    cuerpo.innerHTML = r.datos.length ? r.datos.map(t => `<tr>
        <td class="sku"><strong>${txt(t.folio)}</strong></td>
        <td class="fecha">${txt(fecha(t.fecha_timestamp))}</td>
        <td><span class="marca-estado ${t.tipo === 'Venta' ? 'estado-aviso' : 'estado-ok'}">${txt(t.tipo)}</span></td>
        <td>${txt(t.tipo === 'Venta' ? t.cliente.nombre : t.razon_social)}</td>
        <td class="numero">${entero(t.unidades)}</td>
        <td class="numero">${dinero(t.total)}</td>
        <td>${txt(t.id_usuario ? t.id_usuario.nombre : '')}</td>
        <td><button type="button" class="boton-menor boton-secundario" data-ver="${txt(t._id)}">Ver</button></td>
      </tr>`).join('') : '<tr><td colspan="8" class="vacio">Sin operaciones registradas</td></tr>';
    $('h-paginacion').textContent = esAdmin
      ? `${r.total} operaciones en el historial`
      : `${r.total} operaciones registradas por usted`;
    cuerpo.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', async () => {
      try {
        const d = await pedir('/transacciones/' + b.dataset.ver);
        mostrarComprobante(d.dato);
      } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
    }));
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  }
}

$('h-tipo').addEventListener('change', cargarHistorial);

let espera = null;
$('c-buscar').addEventListener('input', () => {
  clearTimeout(espera);
  espera = setTimeout(cargarCatalogo, 250);
});

/* Una venta o compra hecha en otra sesion actualiza esta pantalla sola. */
const canal = conectarEventos();
if (canal) canal.on('transaccion:nueva', () => { cargarCatalogo(); cargarHistorial(); });

async function iniciar() {
  pintarModo();
  pintarCarro();
  if (esAdmin) {
    try {
      const provs = await pedir('/proveedores?limite=100&activo=true');
      $('c-proveedor').innerHTML = '<option value="">Seleccione el proveedor</option>' +
        provs.datos.map(p => `<option value="${txt(p._id)}">${txt(p.razon_social)}</option>`).join('');
    } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
  }
  await refrescarLineas();
  await Promise.all([cargarCatalogo(), cargarHistorial()]);
}

iniciar();
