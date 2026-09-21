Sesion.exigir(['Administrador']);
montarNavegacion('usuarios.html');
conectarEventos();

const dlg = document.getElementById('dlg-usuario');

async function cargar() {
  try {
    const r = await pedir('/usuarios');
    const cuerpo = document.getElementById('tb-usuarios');
    cuerpo.innerHTML = r.datos.map(u => `<tr>
        <td>${txt(u.nombre)}</td>
        <td>${txt(u.email)}</td>
        <td><span class="marca-estado ${u.rol === 'Administrador' ? 'estado-aviso' : 'estado-neutro'}">${txt(u.rol)}</span></td>
        <td><span class="marca-estado ${u.estado ? 'estado-ok' : 'estado-critico'}">${u.estado ? 'Activa' : 'Desactivada'}</span></td>
        <td>${txt(fecha(u.creado_en))}</td>
        <td>${u.estado ? `<button class="boton-menor boton-peligro" data-baja="${txt(u._id)}">Desactivar</button>` : ''}</td>
      </tr>`).join('');
    cuerpo.querySelectorAll('[data-baja]').forEach(b =>
      b.addEventListener('click', () => desactivar(b.dataset.baja)));
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

async function desactivar(id) {
  if (!window.confirm('La cuenta no podra iniciar sesion. Confirme la desactivacion.')) return;
  try {
    await pedir('/usuarios/' + id, { method: 'DELETE' });
    mostrarAviso('aviso', 'Cuenta desactivada.', 'aviso-ok');
    cargar();
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

document.getElementById('btn-nuevo').addEventListener('click', () => {
  document.getElementById('form-usuario').reset();
  mostrarAviso('dlg-aviso', '', 'aviso-error');
  dlg.showModal();
});
document.getElementById('btn-cancelar').addEventListener('click', () => dlg.close());

document.getElementById('form-usuario').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = {
    nombre:   document.getElementById('f-nombre').value.trim(),
    email:    document.getElementById('f-email').value.trim(),
    password: document.getElementById('f-password').value,
    rol:      document.getElementById('f-rol').value
  };
  try {
    await pedir('/usuarios', { method: 'POST', body: JSON.stringify(cuerpo) });
    dlg.close();
    mostrarAviso('aviso', 'Cuenta creada. La contrasena quedo cifrada con bcrypt.', 'aviso-ok');
    cargar();
  } catch (e) { mostrarAviso('dlg-aviso', e.message, 'aviso-error'); }
});

cargar();
