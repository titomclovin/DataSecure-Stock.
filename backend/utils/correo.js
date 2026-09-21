const nodemailer = require('nodemailer');

/**
 * Envio del enlace de recuperacion de credenciales.
 * Si no hay servidor SMTP configurado (entorno de desarrollo o de pruebas),
 * el mensaje se registra en consola y la funcion devuelve el mismo resultado:
 * el flujo del sistema no cambia y no se exponen datos del usuario.
 */
async function enviarEnlaceRecuperacion(destino, enlace) {
  const host = process.env.SMTP_HOST;
  const cuerpo = [
    'Recibimos una solicitud para restablecer la contrasena de su cuenta en DataSecure Stock.',
    `Enlace de un solo uso (vence en 30 minutos): ${enlace}`,
    'Si usted no solicito el cambio, ignore este mensaje: su contrasena actual sigue vigente.'
  ].join('\n\n');

  if (!host) {
    console.log(`[correo simulado] para=${destino} enlace=${enlace}`);
    return { enviado: false, simulado: true };
  }

  const transporte = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  await transporte.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@datasecurestock.cl',
    to: destino,
    subject: 'DataSecure Stock - Restablecer contrasena',
    text: cuerpo
  });
  return { enviado: true, simulado: false };
}

module.exports = { enviarEnlaceRecuperacion };
