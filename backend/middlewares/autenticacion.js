const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');

const SECRETO = () => process.env.JWT_SECRET || 'cambiar-en-produccion';

function firmarToken(usuario) {
  return jwt.sign(
    { sub: usuario._id.toString(), rol: usuario.rol, email: usuario.email },
    SECRETO(),
    { expiresIn: process.env.JWT_EXPIRA || '2h', issuer: 'datasecure-stock' }
  );
}

/**
 * Verifica el JWT del encabezado Authorization. Ninguna ruta de negocio
 * responde sin pasar por aqui: la API es stateless y cada peticion se valida.
 */
async function requiereAutenticacion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token de sesion ausente' });
  }
  try {
    const carga = jwt.verify(token, SECRETO(), { issuer: 'datasecure-stock' });
    const usuario = await Usuario.findById(carga.sub);
    if (!usuario || !usuario.estado) {
      return res.status(401).json({ ok: false, error: 'Cuenta inexistente o desactivada' });
    }
    req.usuario = usuario;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Token invalido o expirado' });
  }
}

/**
 * Control de acceso basado en roles (RBAC). Aplica el principio de minimo
 * privilegio: el Operador solo lee el catalogo y registra movimientos.
 */
function requiereRol(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ ok: false, error: 'Sesion no iniciada' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, error: 'El rol no tiene permiso sobre este recurso' });
    }
    next();
  };
}

module.exports = { firmarToken, requiereAutenticacion, requiereRol };
