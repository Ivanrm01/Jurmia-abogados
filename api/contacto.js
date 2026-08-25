/**
 * Recibe las consultas del formulario y las envía por correo al despacho
 * a través del SMTP de IONOS (véase api/_correo.js).
 *
 * Variables de entorno necesarias en Vercel:
 *   SMTP_USUARIO     buzón de IONOS, p. ej. web@jurmiabogados.es
 *   SMTP_CLAVE       contraseña de ese buzón
 *   CORREO_DESTINO   dirección donde se reciben las consultas
 *
 * Opcionales: SMTP_SERVIDOR, SMTP_PUERTO, CORREO_ORIGEN, CLAVE_PRUEBA_CORREO
 */

import { enviarCorreo, correoConfigurado, comprobarConexion } from "./_correo.js";

export default async function handler(req, res) {
  // Prueba de configuración: /api/contacto?prueba=LA_CLAVE
  // Solo funciona si se ha definido CLAVE_PRUEBA_CORREO en Vercel.
  if (req.method === "GET") {
    const clavePrueba = process.env.CLAVE_PRUEBA_CORREO;
    if (!clavePrueba || (req.query && req.query.prueba) !== clavePrueba) {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Método no permitido" });
    }
    try {
      if (!correoConfigurado()) {
        return res.status(500).json({ ok: false, error: "Faltan variables de entorno" });
      }
      await comprobarConexion();
      return res.status(200).json({
        ok: true,
        servidor: process.env.SMTP_SERVIDOR || "smtp.ionos.es",
        puerto: process.env.SMTP_PUERTO || "587",
        usuario: process.env.SMTP_USUARIO,
        destino: process.env.CORREO_DESTINO
      });
    } catch (error) {
      return res.status(502).json({ ok: false, error: error.message });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const datos = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { nombre, telefono, email, area, despacho, mensaje, consentimiento, empresa } = datos;

  // Campo trampa: si viene relleno, es un bot. Respondemos ok para no darle pistas.
  if (empresa) return res.status(200).json({ ok: true });

  if (!nombre || !telefono || !email || !area || !mensaje || !consentimiento) {
    return res.status(400).json({ error: "Faltan datos obligatorios" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Correo electrónico no válido" });
  }
  if (String(mensaje).length > 6000) {
    return res.status(400).json({ error: "El mensaje es demasiado largo" });
  }

  if (!correoConfigurado()) {
    console.error("Faltan variables de entorno del correo");
    return res.status(500).json({ error: "El envío no está configurado" });
  }

  const escapar = (t) =>
    String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const html = `
    <h2>Nueva consulta desde la web</h2>
    <p><strong>Nombre:</strong> ${escapar(nombre)}</p>
    <p><strong>Teléfono:</strong> ${escapar(telefono)}</p>
    <p><strong>Correo:</strong> ${escapar(email)}</p>
    <p><strong>Área:</strong> ${escapar(area)}</p>
    <p><strong>Despacho:</strong> ${escapar(despacho || "-")}</p>
    <hr>
    <p>${escapar(mensaje).replace(/\n/g, "<br>")}</p>
    <hr>
    <p style="font-size:12px;color:#666">Recibido el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p>
  `;

  try {
    await enviarCorreo({
      asunto: `Consulta ${area} — ${nombre}`,
      html,
      responderA: email
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Envío por SMTP:", error && error.message);
    return res.status(502).json({ error: "No se pudo enviar el correo" });
  }
}
