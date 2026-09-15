Sesion.exigir(['Administrador', 'Operador']);
montarNavegacion('movimientos.html');
conectarEventos();

async function cargarProductos() {
  const r = await pedir('/productos?limite=100&activo=true');
  document.getElementById('m-producto').innerHTML =
    r.datos.map(p => `<option value="${txt(p._id)}">${txt(p.sku)} - ${txt(p.nombre)} (stock ${entero(p.stock_actual)})</option>`).join('');
}

async function cargarHistorial() {
  const tipo = document.getElementById('f-tipo').value;
  const r = await pedir('/movimientos?limite=15' + (tipo ? '&tipo=' + tipo : ''));
  const cuerpo = document.getElementById('tb-movimientos');
  cuerpo.innerHTML = r.datos.length ? r.datos.map(m => `<tr>
      <td>${txt(fecha(m.fecha_timestamp))}</td>
      <td>${txt(m.id_producto ? m.id_producto.sku + ' - ' + m.id_producto.nombre : 'Producto eliminado')}</td>
      <td><span class="marca-estado ${m.tipo_operacion === 'Entrada' ? 'estado-ok' : 'estado-aviso'}">${txt(m.tipo_operacion)}</span></td>
      <td class="numero">${entero(m.cantidad)}</td>
      <td class="numero">${entero(m.stock_resultante)}</td>
      <td>${txt(m.id_usuario ? m.id_usuario.nombre : '')}</td>
      <td>${txt(m.observacion)}</td>
    </tr>`).join('') : '<tr><td colspan="7" class="vacio">Sin movimientos registrados</td></tr>';
  document.getElementById('paginacion').textContent = `${r.total} movimientos en el historial`;
}

document.getElementById('f-tipo').addEventListener('change', cargarHistorial);

document.getElementById('form-movimiento').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = document.getElementById('btn-registrar');
  boton.disabled = true;
  const cuerpo = {
    id_producto:    document.getElementById('m-producto').value,
    tipo_operacion: document.getElementById('m-tipo').value,
    cantidad:       Number(document.getElementById('m-cantidad').value),
    observacion:    document.getElementById('m-obs').value.trim()
  };
  try {
    const r = await pedir('/movimientos', { method: 'POST', body: JSON.stringify(cuerpo) });
    mostrarAviso('aviso', `Movimiento registrado. Stock resultante: ${entero(r.stock_actual)} unidades.`, 'aviso-ok');
    document.getElementById('m-obs').value = '';
    await cargarProductos();
    await cargarHistorial();
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  } finally {
    boton.disabled = false;
  }
});

cargarProductos().then(cargarHistorial);
