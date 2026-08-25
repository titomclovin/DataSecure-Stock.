# DataSecure Stock 🔐📦

Plataforma web para la gestión inteligente de inventario y seguridad de datos, desarrollada para la empresa TecnoSur SpA.

## 🚀 Arquitectura del Proyecto
Este repositorio contiene la estructura inicial bajo el patrón MVC, separando la lógica en tres capas principales:

- **/frontend:** Interfaz de usuario responsiva construida con HTML5 y CSS puro (Grid/Flexbox) sin el uso de frameworks externos para minimizar vulnerabilidades del lado del cliente.
- **/backend:** API REST desarrollada en Node.js y Express.js. Su arquitectura asíncrona es ideal para manejar el alto flujo de peticiones (Big Data).
- **/database:** Esquema NoSQL (MongoDB) orientado a documentos, optimizado para escalabilidad horizontal y minería de logs de seguridad.

## 🛡️ Integración de Big Data y Ciberseguridad
El sistema no solo gestiona el catálogo, sino que procesa miles de transacciones operativas. 
- **Big Data:** Los `Logs_Seguridad` se almacenan en una colección NoSQL de solo escritura para detectar anomalías y patrones de riesgo en tiempo real.
- **Ciberseguridad:** La API cuenta con middlewares de validación, protección de rutas mediante tokens JWT y encriptación de contraseñas mediante hashing. Ningún dato se inserta en la base de datos sin ser sanitizado para prevenir inyecciones.