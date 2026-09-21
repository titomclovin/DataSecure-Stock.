/* Capa comun del cliente: sesion, llamadas a la API y utilidades de vista. */

const API = '/api';
const CLAVE_TOKEN = 'dss_token';
const CLAVE_USUARIO = 'dss_usuario';

const Sesion = {
  guardar(token, usuario) {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  },
  token() { return localStorage.getItem(CLAVE_TOKEN); },
  usuario() {
    try { return JSON.parse(localStorage.getItem(CLAVE_USUARIO) || 'null'); }
    catch (e) { return null; }
  },
  cerrar() {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
    window.location.href = 'index.html';
  },
  exigir(rolesPermitidos) {
    const u = this.usuario();
    if (!this.token() || !u) { window.location.href = 'index.html'; return null; }
    if (rolesPermitidos && !rolesPermitidos.includes(u.rol)) { window.location.href = 'movimientos.html'; return null; }
    return u;
  }
};

async function pedir(ruta, opciones = {}) {
  const cabeceras = Object.assign({ 'Content-Type': 'application/json' }, opciones.headers || {});
  const token = Sesion.token();
  if (token) cabeceras.Authorization = `Bearer ${token}`;
  const respuesta = await fetch(API + ruta, Object.assign({}, opciones, { headers: cabeceras }));
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }
  if (respuesta.status === 401 && !ruta.startsWith('/auth/')) { Sesion.cerrar(); }
  if (!respuesta.ok) {
    const error = new Error(cuerpo.error || `Error ${respuesta.status}`);
    error.estado = respuesta.status;
    error.campos = cuerpo.campos;
    throw error;
  }
  return cuerpo;
}

const dinero = n => '$' + Number(n || 0).toLocaleString('es-CL');
const entero = n => Number(n || 0).toLocaleString('es-CL');
const fecha = d => new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });

/* Escapa el texto antes de inyectarlo: ningun dato de la base se interpreta como HTML. */
function txt(valor) {
  const div = document.createElement('div');
  div.textContent = valor === undefined || valor === null ? '' : String(valor);
  return div.innerHTML;
}

function mostrarAviso(id, mensaje, clase) {
  const caja = document.getElementById(id);
  if (!caja) return;
  caja.textContent = mensaje;
  caja.className = 'aviso ' + (clase || 'aviso-info');
  caja.hidden = !mensaje;
}

function notificar(titulo, detalle) {
  let pila = document.querySelector('.pila-notificaciones');
  if (!pila) {
    pila = document.createElement('div');
    pila.className = 'pila-notificaciones';
    document.body.appendChild(pila);
  }
  const item = document.createElement('div');
  item.className = 'notificacion';
  item.innerHTML = `<strong>${txt(titulo)}</strong>${txt(detalle)}`;
  pila.appendChild(item);
  setTimeout(() => item.remove(), 12000);
}

/* Arma la barra superior y el menu lateral segun el rol de la sesion. */
function montarNavegacion(paginaActual) {
  const usuario = Sesion.usuario();
  if (!usuario) return;

  const barra = document.querySelector('.barra-superior');
  if (barra) {
    barra.innerHTML = `
      <div class="grupo-marca">
        <button class="alternar-menu" id="btn-menu" type="button" aria-label="Abrir menu">&#9776;</button>
        <div class="marca">DataSecure Stock<span>TecnoSur SpA</span></div>
      </div>
      <div class="sesion">
        <span>${txt(usuario.nombre)}</span>
        <span class="etiqueta-rol">${txt(usuario.rol)}</span>
        <button class="boton-secundario boton-menor" id="btn-salir" type="button">Cerrar sesion</button>
      </div>`;
  }

  const enlaces = [
    { grupo: 'Operacion' },
    { href: 'dashboard.html',   texto: 'Panel de analisis', roles: ['Administrador'] },
    { href: 'productos.html',   texto: 'Catalogo de productos', roles: ['Administrador', 'Operador'] },
    { href: 'movimientos.html', texto: 'Entradas y salidas', roles: ['Administrador', 'Operador'] },
    { grupo: 'Maestros' },
    { href: 'categorias.html',  texto: 'Categorias', roles: ['Administrador', 'Operador'] },
    { href: 'proveedores.html', texto: 'Proveedores', roles: ['Administrador', 'Operador'] },
    { grupo: 'Seguridad' },
    { href: 'usuarios.html',    texto: 'Cuentas de usuario', roles: ['Administrador'] },
    { href: 'auditoria.html',   texto: 'Auditoria y alertas', roles: ['Administrador'] }
  ];

  const menu = document.querySelector('.menu-lateral');
  if (menu) {
    const lista = document.createElement('ul');
    enlaces.forEach(e => {
      if (e.grupo) {
        const li = document.createElement('li');
        li.className = 'grupo';
        li.textContent = e.grupo;
        lista.appendChild(li);
        return;
      }
      if (!e.roles.includes(usuario.rol)) return;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = e.href;
      a.textContent = e.texto;
      if (e.href === paginaActual) a.className = 'activo';
      li.appendChild(a);
      lista.appendChild(li);
    });
    menu.innerHTML = '';
    menu.appendChild(lista);
  }

  const btnSalir = document.getElementById('btn-salir');
  if (btnSalir) btnSalir.addEventListener('click', () => Sesion.cerrar());
  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu && menu) btnMenu.addEventListener('click', () => menu.classList.toggle('abierto'));
}

/* Canal de eventos en tiempo real (Socket.IO). Solo el Administrador
   recibe las alertas de ciberseguridad; el cambio de stock lo ven ambos. */
function conectarEventos(alRecibirAlerta) {
  if (typeof io === 'undefined') return null;
  const socket = io({ auth: { token: Sesion.token() } });
  socket.on('alerta:nueva', alerta => {
    notificar('Alerta de ciberseguridad', alerta.descripcion);
    if (alRecibirAlerta) alRecibirAlerta(alerta);
  });
  socket.on('stock:cambio', evento => {
    notificar(`${evento.tipo} de stock`, `${evento.producto}: ${evento.cantidad} unidades (quedan ${evento.stock_actual})`);
  });
  return socket;
}
