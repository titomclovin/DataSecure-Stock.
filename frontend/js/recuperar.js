document.getElementById('form-recuperar').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = document.getElementById('btn-enviar');
  const email = document.getElementById('email').value.trim();
  boton.disabled = true;
  try {
    const r = await pedir('/auth/recuperar', { method: 'POST', body: JSON.stringify({ email }) });
    mostrarAviso('aviso', r.mensaje, 'aviso-ok');
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  } finally {
    boton.disabled = false;
  }
});
