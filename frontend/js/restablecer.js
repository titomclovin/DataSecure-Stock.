const parametros = new URLSearchParams(window.location.search);
const token = parametros.get('token') || '';

if (!token) {
  mostrarAviso('aviso', 'El enlace de recuperacion no es valido.', 'aviso-error');
}

document.getElementById('form-restablecer').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const p1 = document.getElementById('password').value;
  const p2 = document.getElementById('password2').value;
  if (p1 !== p2) {
    mostrarAviso('aviso', 'Las contrasenas no coinciden.', 'aviso-error');
    return;
  }
  try {
    await pedir('/auth/restablecer', { method: 'POST', body: JSON.stringify({ token, password: p1 }) });
    mostrarAviso('aviso', 'Contrasena actualizada. Ya puede iniciar sesion.', 'aviso-ok');
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  }
});
