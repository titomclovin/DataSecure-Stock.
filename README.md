# DataSecure Stock

Plataforma web de gestion inteligente de inventario y seguridad de datos para **TecnoSur SpA**.
Proyecto de Titulo - Escuela de Informatica y Telecomunicaciones.

La solucion integra la operacion de bodega con una capa analitica de ciberseguridad:
toda accion sobre el sistema queda registrada en una coleccion append-only y un motor
de reglas evalua esos datos para levantar alertas en tiempo real hacia el panel del
administrador.

---

## 1. Requisitos

| Componente | Version minima |
|------------|----------------|
| Node.js    | 20 LTS         |
| MongoDB    | 7.0            |
| Navegador  | Chrome / Edge / Firefox actualizado |

## 2. Puesta en marcha

```bash
npm install
cp .env.example .env          # completar MONGO_URI y JWT_SECRET
npm run seed                  # carga el catalogo y la telemetria de ejemplo
npm start                     # http://localhost:3000
```

## 3. Cuentas de demostracion (creadas por el seed)

| Perfil        | Correo                  | Contrasena          |
|---------------|-------------------------|---------------------|
| Administrador | admin@tecnosur.cl       | Admin2026#Seguro    |
| Operador      | operador@tecnosur.cl    | Operador2026#Bod    |
| Operador      | bodega2@tecnosur.cl     | Bodega2026#Sur      |

Cambiar estas contrasenas antes de cualquier despliegue publico.

## 4. Estructura

```
DataSecure-Stock/
├── backend/
│   ├── app.js              construccion de Express y cadena de middlewares
│   ├── server.js           arranque HTTP + canal Socket.IO autenticado
│   ├── seed.js             carga inicial de datos
│   ├── config/db.js        conexion unica a MongoDB
│   ├── models/             7 esquemas Mongoose (una coleccion cada uno)
│   ├── controllers/        logica de negocio por modulo
│   ├── middlewares/        JWT, RBAC, auditoria, limites, errores
│   ├── routes/index.js     definicion y validacion de todos los endpoints
│   └── utils/              motor analitico y envio de correo
├── frontend/               HTML5 + CSS3 nativo + JavaScript ES6 (sin frameworks)
├── database/               diccionario de datos, indices y exportacion JSON
└── tests/pruebas.js        suite de 20 casos funcionales y de seguridad
```

## 5. Perfiles y permisos

| Recurso                      | Administrador | Operador     |
|------------------------------|---------------|--------------|
| Catalogo de productos        | CRUD completo | Solo lectura |
| Proveedores y categorias     | CRUD completo | Solo lectura |
| Movimientos de stock         | Registrar y consultar | Registrar y consultar |
| Cuentas de usuario           | CRUD completo | Sin acceso   |
| Auditoria y alertas          | Consulta y cierre | Sin acceso |
| Panel de analisis            | Acceso        | Sin acceso   |

## 6. Medidas de ciberseguridad implementadas

1. Contrasenas cifradas con **bcrypt** (factor de costo 10); el hash nunca sale por la API.
2. Autenticacion **JWT** firmada, con emisor y vencimiento, verificada en cada peticion.
3. **RBAC** por ruta con principio de minimo privilegio.
4. **Sanitizacion** de operadores de MongoDB para neutralizar inyeccion NoSQL.
5. **Validacion** de todos los campos de entrada con express-validator.
6. **Rate limiting** diferenciado: global, de acceso y de recuperacion de credenciales.
7. Bloqueo temporal de la cuenta tras cinco intentos fallidos consecutivos.
8. Cabeceras de seguridad con **Helmet** (CSP, HSTS, sin X-Powered-By).
9. Auditoria **append-only** de toda accion que modifica estado.
10. Enlace de recuperacion de un solo uso, almacenado como hash SHA-256 y con vencimiento.

## 7. Pruebas

```bash
npm test
```

Levanta una instancia real de MongoDB, la puebla y ejecuta los 20 casos del plan de
pruebas contra la API por HTTP. Deja el detalle en `tests/resultado_pruebas.json`.

## 8. Despliegue

1. Aprovisionar el servicio de base de datos (MongoDB Atlas con Replica Set) y obtener la cadena de conexion.
2. Crear la aplicacion en el proveedor de hosting con Node.js 20 y definir las variables del archivo `.env`.
3. Publicar el codigo, ejecutar `npm ci --omit=dev` y `npm run seed` la primera vez.
4. Habilitar HTTPS con certificado TLS y dejar Nginx como proxy inverso hacia el puerto de la aplicacion.
5. Restringir el acceso a la base de datos por lista de direcciones IP y crear un usuario con privilegios acotados a la base del proyecto.
