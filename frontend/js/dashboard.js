Sesion.exigir(['Administrador']);
montarNavegacion('dashboard.html');
conectarEventos(() => cargar());

function barra(etiqueta, valor, maximo, claseFila) {
  const ancho = maximo > 0 ? Math.round((valor / maximo) * 100) : 0;
  const fila = document.createElement('div');
  fila.className = 'fila' + (claseFila ? ' ' + claseFila : '');
  const rot = document.createElement('span'); rot.textContent = etiqueta;
  const pista = document.createElement('div'); pista.className = 'pista';
  const relleno = document.createElement('div'); relleno.className = 'relleno';
  relleno.style.width = ancho + '%';
  pista.appendChild(relleno);
  const cifra = document.createElement('span'); cifra.className = 'numero'; cifra.textContent = entero(valor);
  fila.append(rot, pista, cifra);
  return fila;
}

function tarjeta(rotulo, cifra, pie, clase) {
  return `<article class="indicador ${clase || ''}">
      <p class="rotulo">${txt(rotulo)}</p>
      <p class="cifra">${txt(cifra)}</p>
      <p class="pie">${txt(pie)}</p>
    </article>`;
}

async function cargar() {
  try {
    const { indicadores: i } = await pedir('/panel');

    document.getElementById('indicadores').innerHTML = [
      tarjeta('Articulos activos', entero(i.articulos), 'SKU vigentes en catalogo'),
      tarjeta('Unidades en bodega', entero(i.unidades), 'Suma de stock de todos los productos'),
      tarjeta('Inventario valorizado', dinero(i.valorizado), 'Stock por precio unitario'),
      tarjeta('Productos bajo minimo', entero(i.criticos), 'Stock igual o menor al critico', i.criticos > 0 ? 'atencion' : ''),
      tarjeta('Alertas abiertas', entero(i.alertas_abiertas), 'Sin resolver por el administrador', i.alertas_abiertas > 0 ? 'critico' : ''),
      tarjeta('Eventos ultimas 24 h', entero(i.eventos_24h), 'Documentos en la coleccion de logs')
    ].join('');

    const gc = document.getElementById('gr-categorias');
    gc.innerHTML = '';
    const maxCat = Math.max(1, ...i.top_categorias.map(c => c.unidades));
    i.top_categorias.forEach(c => gc.appendChild(barra(c._id, c.unidades, maxCat)));

    const gm = document.getElementById('gr-movimientos');
    gm.innerHTML = '';
    const ultimos = i.movimientos_por_dia.slice(-28);
    const maxMov = Math.max(1, ...ultimos.map(m => m.unidades));
    ultimos.slice(-14).forEach(m => {
      gm.appendChild(barra(`${m._id.dia} - ${m._id.tipo}`, m.unidades, maxMov, m._id.tipo === 'Salida' ? 'salida' : ''));
    });

    const { datos: alertas } = await pedir('/alertas?resuelta=false');
    const cuerpo = document.getElementById('tb-alertas');
    cuerpo.innerHTML = alertas.length
      ? alertas.map(a => `<tr>
          <td>${txt(fecha(a.fecha_deteccion))}</td>
          <td>${txt(a.tipo_amenaza)}</td>
          <td><span class="marca-estado ${a.severidad === 'Critica' || a.severidad === 'Alta' ? 'estado-critico' : 'estado-aviso'}">${txt(a.severidad)}</span></td>
          <td>${txt(a.descripcion)}</td></tr>`).join('')
      : '<tr><td colspan="4" class="vacio">Sin alertas pendientes</td></tr>';
  } catch (e) {
    mostrarAviso('aviso', e.message, 'aviso-error');
  }
}

cargar();
