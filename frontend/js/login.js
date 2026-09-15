document.getElementById('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = document.getElementById('btn-entrar');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  mostrarAviso('aviso', '', 'aviso-error');
  if (!email || password.length < 8) {
    mostrarAviso('aviso', 'Ingrese un correo valido y una contrasena de al menos 8 caracteres.', 'aviso-error');
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Verificando...';
  try {
    const respuesta = await pedir('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    Sesion.guardar(respuesta.token, respuesta.usuario);
    window.location.href = respuesta.usuario.rol === 'Administrador' ? 'dashboard.html' : 'movimientos.html';
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
    boton.disabled = false;
    boton.textContent = 'Iniciar sesion segura';
  }
});
