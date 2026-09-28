const usuario = Sesion.exigir(['Administrador', 'Operador']);
montarNavegacion('productos.html');
const canal = conectarEventos();
if (canal) canal.on('transaccion:nueva', () => cargar(paginaActual));

const esAdmin = usuario.rol === 'Administrador';
const dlg = document.getElementById('dlg-producto');
let paginaActual = 1;
let editandoId = null;

if (!esAdmin) document.getElementById('btn-nuevo').hidden = true;

async function cargarSelectores() {
  const [cats, provs] = await Promise.all([pedir('/categorias?limite=100'), pedir('/proveedores?limite=100')]);
  document.getElementById('f-categoria').innerHTML =
    cats.datos.map(c => `<option value="${txt(c._id)}">${txt(c.nombre_categoria)}</option>`).join('');
  document.getElementById('f-proveedor').innerHTML =
    provs.datos.map(p => `<option value="${txt(p._id)}">${txt(p.razon_social)}</option>`).join('');
}

async function cargar(pagina) {
  paginaActual = pagina || 1;
  const buscar = document.getElementById('buscar').value.trim();
  const consulta = `/productos?pagina=${paginaActual}&limite=10${buscar ? '&buscar=' + encodeURIComponent(buscar) : ''}`;
  try {
    const r = await pedir(consulta);
    const cuerpo = document.getElementById('tb-productos');
    cuerpo.innerHTML = r.datos.length ? r.datos.map(p => {
      const e = estadoProducto(p);
      const vendible = p.activo && p.stock_actual > 0;
      const alCarro = vendible
        ? `<button class="boton-menor boton-carro" data-carro="${txt(p._id)}">Al carro</button>` : '';
      let gestion = '<span class="pie">Solo lectura</span>';
      if (esAdmin) {
        gestion = p.activo
          ? `<button class="boton-menor" data-editar="${txt(p._id)}">Editar</button>
             <button class="boton-menor boton-peligro" data-baja="${txt(p._id)}">Baja</button>`
          : `<button class="boton-menor boton-exito" data-reactivar="${txt(p._id)}">Reactivar</button>`;
      }
      return `<tr${p.activo ? '' : ' class="fila-inactiva"'}>
        <td class="sku">${txt(p.sku)}</td>
        <td>${txt(p.nombre)}</td>
        <td>${txt(p.id_categoria ? p.id_categoria.nombre_categoria : '')}</td>
        <td>${txt(p.id_proveedor ? p.id_proveedor.razon_social : '')}</td>
        <td class="numero">${entero(p.stock_actual)}</td>
        <td class="numero">${dinero(p.precio)}</td>
        <td><span class="marca-estado ${e.clase}">${e.texto}</span></td>
        <td class="acciones">${alCarro} ${gestion}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="vacio">Sin resultados</td></tr>';

    document.getElementById('paginacion').textContent =
      `Página ${r.pagina} de ${r.paginas || 1} - ${r.total} productos`;

    cuerpo.querySelectorAll('[data-editar]').forEach(b =>
      b.addEventListener('click', () => abrir(r.datos.find(p => p._id === b.dataset.editar))));
    cuerpo.querySelectorAll('[data-baja]').forEach(b =>
      b.addEventListener('click', () => darBaja(b.dataset.baja)));
    cuerpo.querySelectorAll('[data-reactivar]').forEach(b =>
      b.addEventListener('click', () => reactivar(b.dataset.reactivar)));
    cuerpo.querySelectorAll('[data-carro]').forEach(b =>
      b.addEventListener('click', () => {
        const p = r.datos.find(x => x._id === b.dataset.carro);
        CarroSesion.agregar(p);
        mostrarAviso('aviso', `${p.sku} agregado al carro. Unidades en el carro: ${CarroSesion.unidades()}.`, 'aviso-ok');
      }));
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  }
}

function abrir(producto) {
  editandoId = producto ? producto._id : null;
  document.getElementById('dlg-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('f-sku').value = producto ? producto.sku : '';
  document.getElementById('f-sku').disabled = Boolean(producto);
  document.getElementById('f-nombre').value = producto ? producto.nombre : '';
  document.getElementById('f-stock').value = producto ? producto.stock_actual : 0;
  document.getElementById('f-stock').disabled = Boolean(producto);
  document.getElementById('f-critico').value = producto ? producto.stock_critico : 5;
  document.getElementById('f-precio').value = producto ? producto.precio : '';
  if (producto && producto.id_categoria) document.getElementById('f-categoria').value = producto.id_categoria._id;
  if (producto && producto.id_proveedor) document.getElementById('f-proveedor').value = producto.id_proveedor._id;
  mostrarAviso('dlg-aviso', '', 'aviso-error');
  dlg.showModal();
}

async function darBaja(id) {
  if (!window.confirm('El producto quedará inactivo: no se podrá vender ni comprar hasta reactivarlo. Confirme la baja.')) return;
  try {
    await pedir('/productos/' + id, { method: 'DELETE' });
    mostrarAviso('aviso', 'Producto dado de baja. Queda inactivo y conserva su historial.', 'aviso-ok');
    cargar(paginaActual);
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

async function reactivar(id) {
  try {
    const r = await pedir('/productos/' + id + '/reactivar', { method: 'PUT' });
    mostrarAviso('aviso', `${r.dato.sku} reactivado: vuelve a estar disponible para venta y compra.`, 'aviso-ok');
    cargar(paginaActual);
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

document.getElementById('btn-nuevo').addEventListener('click', () => abrir(null));
document.getElementById('btn-cancelar').addEventListener('click', () => dlg.close());
document.getElementById('buscar').addEventListener('input', () => cargar(1));

document.getElementById('form-producto').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = {
    nombre:       document.getElementById('f-nombre').value.trim(),
    id_categoria: document.getElementById('f-categoria').value,
    id_proveedor: document.getElementById('f-proveedor').value,
    stock_critico: Number(document.getElementById('f-critico').value),
    precio:       Number(document.getElementById('f-precio').value)
  };
  if (!editandoId) {
    cuerpo.sku = document.getElementById('f-sku').value.trim().toUpperCase();
    cuerpo.stock_actual = Number(document.getElementById('f-stock').value);
  }
  try {
    if (editandoId) await pedir('/productos/' + editandoId, { method: 'PUT', body: JSON.stringify(cuerpo) });
    else await pedir('/productos', { method: 'POST', body: JSON.stringify(cuerpo) });
    dlg.close();
    mostrarAviso('aviso', editandoId ? 'Producto actualizado.' : 'Producto creado.', 'aviso-ok');
    cargar(paginaActual);
  } catch (e) {
    mostrarAviso('dlg-aviso', e.message, 'aviso-error');
  }
});

cargarSelectores().then(() => cargar(1));
