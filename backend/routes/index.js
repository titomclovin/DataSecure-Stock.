const express = require('express');
const { body, param, query } = require('express-validator');

const { validar } = require('../middlewares/errores');
const { requiereAutenticacion, requiereRol } = require('../middlewares/autenticacion');
const { limitadorLogin, limitadorRecuperacion } = require('../middlewares/limitador');

const auth = require('../controllers/authController');
const usuarios = require('../controllers/usuarioController');
const movimientos = require('../controllers/movimientoController');
const transacciones = require('../controllers/transaccionController');
const seguridad = require('../controllers/seguridadController');
const { crearControlador } = require('../controllers/crudFactory');

const Producto = require('../models/Producto');
const Categoria = require('../models/Categoria');
const Proveedor = require('../models/Proveedor');

const router = express.Router();

const ADMIN = ['Administrador'];
const AMBOS = ['Administrador', 'Operador'];

/* ---------------------------------------------------------------- salud */
router.get('/health', (req, res) => {
  res.json({ ok: true, servicio: 'DataSecure Stock API', version: '1.1.0', hora: new Date().toISOString() });
});

/* ------------------------------------------------- autenticacion (RF10) */
router.post('/auth/login', limitadorLogin,
  // bail(): un valor que no es correo ni texto se rechaza tal cual llega, sin
  // convertirlo a cadena, y la auditoria lo registra como entrada no textual.
  body('email').isEmail().withMessage('Correo no válido').bail().normalizeEmail(),
  body('password').isString().withMessage('La contraseña debe ser texto').bail()
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  validar, auth.login);

router.get('/auth/perfil', requiereAutenticacion, auth.perfil);

/* ------------------------------------- recuperacion de credenciales RF11 */
router.post('/auth/recuperar', limitadorRecuperacion,
  body('email').isEmail().bail().normalizeEmail(),
  validar, auth.solicitarRecuperacion);

router.post('/auth/restablecer',
  body('token').isString().withMessage('Token no válido').bail().isLength({ min: 32 }).withMessage('Token no válido'),
  body('password').isString().withMessage('La contraseña debe ser texto').bail()
    .isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
  validar, auth.restablecer);

/* ------------------------------------------------------- CRUD productos */
const ctrlProductos = crearControlador(Producto, {
  campoTexto: 'nombre',
  poblar: [
    { ruta: 'id_categoria', campos: 'nombre_categoria' },
    { ruta: 'id_proveedor', campos: 'razon_social rut_empresa' }
  ],
  // El stock y el estado no se editan a mano: cambian por movimientos, por el
  // carro o por la baja y la reactivacion.
  camposEditables: ['nombre', 'id_categoria', 'id_proveedor', 'stock_critico', 'precio'],
  // El catalogo se recorre por codigo, que es como lo busca la bodega.
  orden: { sku: 1 }
});
router.get('/productos', requiereAutenticacion, requiereRol(...AMBOS),
  query('pagina').optional().isInt({ min: 1 }), query('limite').optional().isInt({ min: 1, max: 100 }),
  validar, ctrlProductos.listar);
router.get('/productos/:id', requiereAutenticacion, requiereRol(...AMBOS),
  param('id').isMongoId(), validar, ctrlProductos.obtener);
router.post('/productos', requiereAutenticacion, requiereRol(...ADMIN),
  body('sku').trim().isLength({ min: 3, max: 20 }).matches(/^[A-Za-z0-9-]+$/)
    .withMessage('El SKU solo admite letras, números y guion, entre 3 y 20 caracteres'),
  body('nombre').trim().isLength({ min: 3, max: 120 }).escape().withMessage('El nombre debe tener entre 3 y 120 caracteres'),
  body('id_categoria').isMongoId().withMessage('Categoría no válida'),
  body('id_proveedor').isMongoId().withMessage('Proveedor no válido'),
  body('precio').isFloat({ min: 0 }).withMessage('El precio debe ser un número positivo'),
  body('stock_actual').optional().isInt({ min: 0 }).withMessage('El stock inicial no puede ser negativo'),
  validar, ctrlProductos.crear);
router.put('/productos/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), body('nombre').optional().trim().isLength({ min: 3, max: 120 }).escape(),
  body('precio').optional().isFloat({ min: 0 }), validar, ctrlProductos.actualizar);
router.delete('/productos/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, ctrlProductos.eliminar);
router.put('/productos/:id/reactivar', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, ctrlProductos.reactivar);

/* ----------------------------------------------------- CRUD proveedores */
const ctrlProveedores = crearControlador(Proveedor, { campoTexto: 'razon_social' });
router.get('/proveedores', requiereAutenticacion, requiereRol(...AMBOS), ctrlProveedores.listar);
router.get('/proveedores/:id', requiereAutenticacion, requiereRol(...AMBOS),
  param('id').isMongoId(), validar, ctrlProveedores.obtener);
router.post('/proveedores', requiereAutenticacion, requiereRol(...ADMIN),
  body('razon_social').trim().isLength({ min: 3, max: 120 }).escape(),
  body('rut_empresa').matches(/^\d{7,8}-[\dkK]$/).withMessage('RUT no válido'),
  body('email_contacto').optional({ checkFalsy: true }).isEmail().bail().normalizeEmail(),
  validar, ctrlProveedores.crear);
router.put('/proveedores/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, ctrlProveedores.actualizar);
router.delete('/proveedores/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, ctrlProveedores.eliminar);

/* ------------------------------------------------------ CRUD categorias */
const ctrlCategorias = crearControlador(Categoria, { campoTexto: 'nombre_categoria', campoActivo: 'activa' });
router.get('/categorias', requiereAutenticacion, requiereRol(...AMBOS), ctrlCategorias.listar);
router.get('/categorias/:id', requiereAutenticacion, requiereRol(...AMBOS),
  param('id').isMongoId(), validar, ctrlCategorias.obtener);
router.post('/categorias', requiereAutenticacion, requiereRol(...ADMIN),
  body('nombre_categoria').trim().isLength({ min: 3, max: 60 }).escape(),
  body('descripcion').optional().trim().isLength({ max: 240 }).escape(),
  validar, ctrlCategorias.crear);
router.put('/categorias/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, ctrlCategorias.actualizar);
router.delete('/categorias/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, ctrlCategorias.eliminar);

/* ------------------------------------------- movimientos de stock (RF04/RF05) */
router.post('/movimientos', requiereAutenticacion, requiereRol(...AMBOS),
  body('id_producto').isMongoId().withMessage('Producto no válido'),
  body('tipo_operacion').isIn(['Entrada', 'Salida']).withMessage('La operación debe ser Entrada o Salida'),
  body('cantidad').isInt({ min: 1, max: 10000 }).withMessage('La cantidad debe ser un entero entre 1 y 10000'),
  body('observacion').optional().trim().isLength({ max: 240 }).escape(),
  validar, movimientos.registrar);
router.get('/movimientos', requiereAutenticacion, requiereRol(...AMBOS), movimientos.historial);

/* ------------------------------ carro de compra y venta (RF15 a RF17) */
router.post('/transacciones', requiereAutenticacion, requiereRol(...AMBOS),
  body('tipo').isIn(['Venta', 'Compra']).withMessage('La operación debe ser Venta o Compra'),
  body('detalle').isArray({ min: 1, max: 50 }).withMessage('El carro debe tener entre 1 y 50 líneas'),
  body('detalle.*.id_producto').isMongoId().withMessage('Producto no válido'),
  body('detalle.*.cantidad').isInt({ min: 1, max: 10000 }).withMessage('La cantidad debe ser un entero entre 1 y 10000'),
  body('detalle.*.costo_unitario').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100000000 })
    .withMessage('Costo unitario no válido'),
  body('id_proveedor').optional({ checkFalsy: true }).isMongoId().withMessage('Proveedor no válido'),
  body('cliente.nombre').optional().trim().isLength({ max: 80 }).escape(),
  body('cliente.rut').optional({ checkFalsy: true }).matches(/^\d{7,8}-[\dkK]$/).withMessage('RUT no válido'),
  body('observacion').optional().trim().isLength({ max: 240 }).escape(),
  validar, transacciones.registrar);
router.get('/transacciones', requiereAutenticacion, requiereRol(...AMBOS),
  query('tipo').optional().isIn(['Venta', 'Compra']),
  query('pagina').optional().isInt({ min: 1 }), query('limite').optional().isInt({ min: 1, max: 100 }),
  validar, transacciones.listar);
router.get('/transacciones/:id', requiereAutenticacion, requiereRol(...AMBOS),
  param('id').isMongoId(), validar, transacciones.obtener);

/* -------------------------------------------- cuentas de usuario (RF09) */
router.get('/usuarios', requiereAutenticacion, requiereRol(...ADMIN), usuarios.listar);
router.post('/usuarios', requiereAutenticacion, requiereRol(...ADMIN),
  body('nombre').trim().isLength({ min: 3, max: 80 }).escape(),
  body('email').isEmail().bail().normalizeEmail(),
  body('password').isString().bail().isLength({ min: 8 }),
  body('rol').isIn(['Administrador', 'Operador']),
  validar, usuarios.crear);
router.put('/usuarios/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, usuarios.actualizar);
router.delete('/usuarios/:id', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, usuarios.desactivar);

/* ------------------------------ auditoria, alertas y panel (RF06 a RF08) */
router.get('/logs', requiereAutenticacion, requiereRol(...ADMIN), seguridad.logs);
router.get('/alertas', requiereAutenticacion, requiereRol(...ADMIN), seguridad.alertas);
router.put('/alertas/:id/resolver', requiereAutenticacion, requiereRol(...ADMIN),
  param('id').isMongoId(), validar, seguridad.resolverAlerta);
router.get('/panel', requiereAutenticacion, requiereRol(...ADMIN), seguridad.panel);

module.exports = router;
