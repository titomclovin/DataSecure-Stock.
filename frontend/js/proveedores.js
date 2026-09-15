const usuario = Sesion.exigir(['Administrador', 'Operador']);
montarNavegacion('proveedores.html');
conectarEventos();

const esAdmin = usuario.rol === 'Administrador';
const dlg = document.getElementById('dlg-proveedor');
let editandoId = null;

if (!esAdmin) document.getElementById('btn-nuevo').hidden = true;

async function cargar() {
  const buscar = document.getElementById('buscar').value.trim();
  try {
    const r = await pedir('/proveedores?limite=50' + (buscar ? '&buscar=' + encodeURIComponent(buscar) : ''));
    const cuerpo = document.getElementById('tb-proveedores');
    cuerpo.innerHTML = r.datos.length ? r.datos.map(p => `<tr>
        <td>${txt(p.razon_social)}</td>
        <td>${txt(p.rut_empresa)}</td>
        <td>${txt(p.contacto)}</td>
        <td>${txt(p.email_contacto)}</td>
        <td class="numero">${txt(p.nivel_confianza)} / 5</td>
        <td><span class="marca-estado ${p.activo ? 'estado-ok' : 'estado-neutro'}">${p.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>${esAdmin ? `<button class="boton-menor" data-editar="${txt(p._id)}">Editar</button>
             <button class="boton-menor boton-peligro" data-baja="${txt(p._id)}">Baja</button>` : '<span class="pie">Solo lectura</span>'}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="vacio">Sin proveedores</td></tr>';

    cuerpo.querySelectorAll('[data-editar]').forEach(b =>
      b.addEventListener('click', () => abrir(r.datos.find(p => p._id === b.dataset.editar))));
    cuerpo.querySelectorAll('[data-baja]').forEach(b =>
      b.addEventListener('click', () => darBaja(b.dataset.baja)));
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

function abrir(proveedor) {
  editandoId = proveedor ? proveedor._id : null;
  document.getElementById('dlg-titulo').textContent = proveedor ? 'Editar proveedor' : 'Nuevo proveedor';
  document.getElementById('f-razon').value = proveedor ? proveedor.razon_social : '';
  document.getElementById('f-rut').value = proveedor ? proveedor.rut_empresa : '';
  document.getElementById('f-rut').disabled = Boolean(proveedor);
  document.getElementById('f-contacto').value = proveedor ? proveedor.contacto : '';
  document.getElementById('f-email').value = proveedor ? proveedor.email_contacto : '';
  document.getElementById('f-confianza').value = proveedor ? proveedor.nivel_confianza : 3;
  mostrarAviso('dlg-aviso', '', 'aviso-error');
  dlg.showModal();
}

async function darBaja(id) {
  if (!window.confirm('El proveedor quedara inactivo. Confirme la baja.')) return;
  try {
    await pedir('/proveedores/' + id, { method: 'DELETE' });
    mostrarAviso('aviso', 'Proveedor dado de baja.', 'aviso-ok');
    cargar();
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

document.getElementById('btn-nuevo').addEventListener('click', () => abrir(null));
document.getElementById('btn-cancelar').addEventListener('click', () => dlg.close());
document.getElementById('buscar').addEventListener('input', cargar);

document.getElementById('form-proveedor').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = {
    razon_social:    document.getElementById('f-razon').value.trim(),
    contacto:        document.getElementById('f-contacto').value.trim(),
    email_contacto:  document.getElementById('f-email').value.trim(),
    nivel_confianza: Number(document.getElementById('f-confianza').value)
  };
  if (!editandoId) cuerpo.rut_empresa = document.getElementById('f-rut').value.trim();
  try {
    if (editandoId) await pedir('/proveedores/' + editandoId, { method: 'PUT', body: JSON.stringify(cuerpo) });
    else await pedir('/proveedores', { method: 'POST', body: JSON.stringify(cuerpo) });
    dlg.close();
    mostrarAviso('aviso', editandoId ? 'Proveedor actualizado.' : 'Proveedor creado.', 'aviso-ok');
    cargar();
  } catch (e) { mostrarAviso('dlg-aviso', e.message, 'aviso-error'); }
});

cargar();
