/**
 * Indices y reglas de validacion de esquema aplicadas en el servidor de base
 * de datos. Se ejecuta con:
 *     mongosh "<MONGO_URI>" database/indices.js
 *
 * Los indices sostienen las consultas del panel y de la auditoria; la
 * validacion $jsonSchema impide que un documento incompleto entre a la
 * coleccion aunque la escritura no pase por la aplicacion.
 */

db.usuarios.createIndex({ email: 1 }, { unique: true, name: 'ux_usuarios_email' });
db.usuarios.createIndex({ rol: 1, estado: 1 }, { name: 'ix_usuarios_rol_estado' });

db.categorias.createIndex({ nombre_categoria: 1 }, { unique: true, name: 'ux_categorias_nombre' });

db.proveedores.createIndex({ rut_empresa: 1 }, { unique: true, name: 'ux_proveedores_rut' });
db.proveedores.createIndex({ razon_social: 1 }, { name: 'ix_proveedores_razon' });

db.productos.createIndex({ sku: 1 }, { unique: true, name: 'ux_productos_sku' });
db.productos.createIndex({ id_categoria: 1, activo: 1 }, { name: 'ix_productos_categoria' });
db.productos.createIndex({ nombre: 'text', sku: 'text' }, { name: 'tx_productos_busqueda' });

db.movimientos.createIndex({ id_producto: 1, fecha_timestamp: -1 }, { name: 'ix_mov_producto_fecha' });
db.movimientos.createIndex({ fecha_timestamp: -1 }, { name: 'ix_mov_fecha' });

db.logs_operativos.createIndex({ fecha_timestamp: -1 }, { name: 'ix_logs_fecha' });
db.logs_operativos.createIndex({ ip_origen: 1, fecha_timestamp: -1 }, { name: 'ix_logs_ip_fecha' });
db.logs_operativos.createIndex({ id_usuario: 1, accion: 1 }, { name: 'ix_logs_usuario_accion' });

db.alertas_ciberseguridad.createIndex({ resuelta: 1, fecha_deteccion: -1 }, { name: 'ix_alertas_estado' });
db.alertas_ciberseguridad.createIndex({ severidad: 1 }, { name: 'ix_alertas_severidad' });

// Validacion de esquema a nivel de motor para las dos colecciones criticas.
db.runCommand({
  collMod: 'usuarios',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['nombre', 'email', 'password_hash', 'rol', 'estado'],
      properties: {
        nombre:        { bsonType: 'string', maxLength: 80 },
        email:         { bsonType: 'string', pattern: '^.+@.+\\..+$' },
        password_hash: { bsonType: 'string', minLength: 55 },
        rol:           { enum: ['Administrador', 'Operador'] },
        estado:        { bsonType: 'bool' }
      }
    }
  },
  validationLevel: 'strict'
});

db.runCommand({
  collMod: 'movimientos',
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['id_producto', 'id_usuario', 'tipo_operacion', 'cantidad', 'stock_resultante'],
      properties: {
        tipo_operacion:   { enum: ['Entrada', 'Salida'] },
        cantidad:         { bsonType: 'int', minimum: 1 },
        stock_resultante: { bsonType: 'int', minimum: 0 }
      }
    }
  },
  validationLevel: 'strict'
});

print('Indices y validadores aplicados sobre la base datasecure_stock');
