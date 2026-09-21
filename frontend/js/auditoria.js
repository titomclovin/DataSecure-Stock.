Sesion.exigir(['Administrador']);
montarNavegacion('auditoria.html');
conectarEventos(() => { cargarAlertas(); cargarLogs(); });

async function cargarAlertas() {
  try {
    const r = await pedir('/alertas');
    const cuerpo = document.getElementById('tb-alertas');
    cuerpo.innerHTML = r.datos.length ? r.datos.map(a => `<tr>
        <td>${txt(fecha(a.fecha_deteccion))}</td>
        <td>${txt(a.tipo_amenaza)}</td>
        <td><span class="marca-estado ${['Critica', 'Alta'].includes(a.severidad) ? 'estado-critico' : 'estado-aviso'}">${txt(a.severidad)}</span></td>
        <td>${txt(a.descripcion)}</td>
        <td>${txt(a.ip_origen)}</td>
        <td><span class="marca-estado ${a.resuelta ? 'estado-ok' : 'estado-critico'}">${a.resuelta ? 'Resuelta' : 'Abierta'}</span></td>
        <td>${a.resuelta ? '' : `<button class="boton-menor" data-resolver="${txt(a._id)}">Marcar resuelta</button>`}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="vacio">Sin alertas registradas</td></tr>';

    cuerpo.querySelectorAll('[data-resolver]').forEach(b =>
      b.addEventListener('click', async () => {
        try {
          await pedir(`/alertas/${b.dataset.resolver}/resolver`, { method: 'PUT' });
          mostrarAviso('aviso', 'Alerta cerrada.', 'aviso-ok');
          cargarAlertas();
        } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
      }));
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

async function cargarLogs() {
  const exito = document.getElementById('f-exito').value;
  try {
    const r = await pedir('/logs?limite=25' + (exito ? '&exito=' + exito : ''));
    const cuerpo = document.getElementById('tb-logs');
    cuerpo.innerHTML = r.datos.map(l => `<tr>
        <td>${txt(fecha(l.fecha_timestamp))}</td>
        <td>${txt(l.email_usuario)}</td>
        <td>${txt(l.accion)}</td>
        <td>${txt(l.recurso)}</td>
        <td>${txt(l.metodo_http)}</td>
        <td class="numero">${txt(l.codigo_respuesta)}</td>
        <td>${txt(l.ip_origen)}</td>
        <td><span class="marca-estado ${l.exito ? 'estado-ok' : 'estado-critico'}">${l.exito ? 'Exito' : 'Fallo'}</span></td>
      </tr>`).join('');
    document.getElementById('paginacion').textContent = `${entero(r.total)} eventos registrados en la coleccion logs_operativos`;
  } catch (e) { mostrarAviso('aviso', e.message, 'aviso-error'); }
}

document.getElementById('f-exito').addEventListener('change', cargarLogs);

cargarAlertas();
cargarLogs();
