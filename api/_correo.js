/**
 * Envío de correo desde el servidor a través del SMTP de IONOS.
 *
 * Lo usan los tres formularios de la web: contacto, reclamación de vuelos y
 * tarjetas revolving. Antes se enviaba con Resend; ahora sale directamente
 * desde el buzón del despacho, sin intermediarios ni verificación de dominio.
 *
 * Variables de entorno necesarias en Vercel:
 *   SMTP_USUARIO     buzón completo de IONOS, p. ej. web@jurmiabogados.es
 *   SMTP_CLAVE       contraseña de ese buzón
 *   CORREO_DESTINO   dirección donde se quieren recibir los avisos
 *
 * Opcionales:
 *   SMTP_SERVIDOR    por defecto smtp.ionos.es
 *   SMTP_PUERTO      por defecto 587 (STARTTLS). 465 activa SSL directo
 *   CORREO_ORIGEN    remitente; debe ser el propio buzón o un alias suyo.
 *                    Si no se indica, se usa SMTP_USUARIO
 */

import nodemailer from "nodemailer";

let transporte = null;

/** ¿Están las variables mínimas para poder enviar? */
export function correoConfigurado() {
  return Boolean(process.env.SMTP_USUARIO && process.env.SMTP_CLAVE && process.env.CORREO_DESTINO);
}

function obtenerTransporte() {
  if (transporte) return transporte;

  const puerto = parseInt(process.env.SMTP_PUERTO || "587", 10);

  transporte = nodemailer.createTransport({
    host: process.env.SMTP_SERVIDOR || "smtp.ionos.es",
    port: puerto,
    secure: puerto === 465, // 465 = SSL directo; 587 = STARTTLS
    requireTLS: puerto !== 465,
    auth: {
      user: process.env.SMTP_USUARIO,
      pass: process.env.SMTP_CLAVE
    },
    // La función serverless tiene un tiempo de vida corto: mejor fallar pronto
    // y dejar rastro en los registros que quedarse colgado.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000
  });

  return transporte;
}

/** Versión en texto plano a partir del HTML: mejora la entrega y evita la carpeta de spam. */
function aTextoPlano(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h1|h2|h3|div|tr)>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n----------\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Envía un aviso al despacho.
 *
 * @param {object} opciones
 * @param {string} opciones.asunto
 * @param {string} opciones.html
 * @param {string} [opciones.responderA]  correo del cliente, para responder con un clic
 * @param {string} [opciones.remitente]   nombre visible del remitente
 * @returns {Promise<{ok: boolean, id?: string}>}
 */
export async function enviarCorreo({ asunto, html, responderA, remitente = "Web JURMIA Abogados" }) {
  if (!correoConfigurado()) {
    throw new Error("Faltan las variables de entorno del correo (SMTP_USUARIO, SMTP_CLAVE, CORREO_DESTINO)");
  }

  const buzon = process.env.SMTP_USUARIO;
  // IONOS solo acepta como remitente el buzón autenticado o uno de sus alias.
  const origen = process.env.CORREO_ORIGEN || buzon;

  const mensaje = {
    from: `${remitente} <${origen}>`,
    to: process.env.CORREO_DESTINO.split(",").map((d) => d.trim()).filter(Boolean),
    subject: asunto,
    html,
    text: aTextoPlano(html),
    // El sobre sale siempre del buzón autenticado, aunque el remitente visible
    // sea un alias: es lo que esperan SPF y DMARC.
    envelope: {
      from: buzon,
      to: process.env.CORREO_DESTINO.split(",").map((d) => d.trim()).filter(Boolean)
    }
  };

  if (responderA && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responderA)) {
    mensaje.replyTo = responderA;
  }

  const info = await obtenerTransporte().sendMail(mensaje);
  return { ok: true, id: info.messageId };
}

/** Comprueba credenciales y conexión sin enviar nada. La usa /api/contacto?prueba=1 */
export async function comprobarConexion() {
  await obtenerTransporte().verify();
  return true;
}
