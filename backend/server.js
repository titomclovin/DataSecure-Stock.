const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares de ciberseguridad
app.use(helmet());
app.use(express.json());

// Endpoint inicial de prueba
app.get('/', (req, res) => {
    res.status(200).json({ mensaje: 'API DataSecure Stock funcionando correctamente' });
});

// Inicialización del servidor
app.listen(PORT, () => {
    console.log(`Servidor de DataSecure Stock ejecutándose en el puerto ${PORT}`);
    console.log('Esperando conexión al clúster de MongoDB...');
});