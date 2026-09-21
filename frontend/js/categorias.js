const usuario = Sesion.exigir(['Administrador', 'Operador']);
montarNavegacion('categorias.html');
conectarEventos();

const esAdmin = usuario.rol === 'Administrador';
const dlg = document.getElementById('dlg-categoria');
let editandoId = null;

if (!esAdmin) document.getElementById('btn-nuevo').hidden = true;

async function cargar() {
  const buscar = document.getElementById('buscar').value.trim();
  try {
    const r = await pedir('/categorias?limite=50' + (buscar ? '&buscar=' + encodeURIComponent(buscar) : ''));
    const cuerpo = document.getElementById('tb-categorias');
    cuerpo.innerHTML = r.datos.length ? r.datos.map(c => `<tr>
        <td>${txt(c.nombre_categoria)}</td>
        <td>${txt(c.descripcion)}</td>
        <td><span class="marca-estado ${c.activa ? 'estado-ok' : 'estado-neutro'}">${c.activa ? 'Activa' : 'Inactiva'}</span></td>
        <td>${esAdmin ? `<button class="boton-menor" data-editar="${txt(c._id)}">Editar</button>
             <button class="boton-menor boton-peligro" data-baja="${txt(c._id)}">Baja</button>` : '<span class="pie">Solo lectura</span>'}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="vacio">Sin categorias</td></tr>';

    cuerpo.querySelectorAll('[data-editar]').forEach(b =>
      b.addEventListener('click', () => abrir(r.datos.find(c => c._id === b.dataset.editar))));
    cuerpo.querySelectorAll('[data-baja]').forEach(b =>
      b.addEventListener('click', () => darBaja(b.dataset.baja)));
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

function abrir(categoria) {
  editandoId = categoria ? categoria._id : null;
  document.getElementById('dlg-titulo').textContent = categoria ? 'Editar categoria' : 'Nueva categoria';
  document.getElementById('f-nombre').value = categoria ? categoria.nombre_categoria : '';
  document.getElementById('f-descripcion').value = categoria ? categoria.descripcion : '';
  mostrarAviso('dlg-aviso', '', 'aviso-error');
  dlg.showModal();
}

async function darBaja(id) {
  if (!window.confirm('La categoria quedara inactiva. Confirme la baja.')) return;
  try {
    await pedir('/categorias/' + id, { method: 'DELETE' });
    mostrarAviso('aviso', 'Categoria dada de baja.', 'aviso-ok');
    cargar();
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

document.getElementById('btn-nuevo').addEventListener('click', () => abrir(null));
document.getElementById('btn-cancelar').addEventListener('click', () => dlg.close());
document.getElementById('buscar').addEventListener('input', cargar);

document.getElementById('form-categoria').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = {
    nombre_categoria: document.getElementById('f-nombre').value.trim(),
    descripcion: document.getElementById('f-descripcion').value.trim()
  };
  try {
    if (editandoId) await pedir('/categorias/' + editandoId, { method: 'PUT', body: JSON.stringify(cuerpo) });
    else await pedir('/categorias', { method: 'POST', body: JSON.stringify(cuerpo) });
    dlg.close();
    mostrarAviso('aviso', editandoId ? 'Categoria actualizada.' : 'Categoria creada.', 'aviso-ok');
    cargar();
  } catch (e) { mostrarAviso('dlg-aviso', e.message, 'aviso-error'); }
});

cargar();
