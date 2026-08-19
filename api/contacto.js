/**
 * Recibe las consultas del formulario y las envía por correo al despacho.
 *
 * Variables de entorno necesarias en Vercel:
 *   RESEND_API_KEY   clave de https://resend.com (plan gratuito suficiente)
 *   CORREO_DESTINO   dirección del despacho, p. ej. info@jurmiabogados.es
 *   CORREO_ORIGEN    remitente verificado en Resend, p. ej. web@jurmiabogados.es
 */

export default async function handler(req, res) {
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

  const clave = process.env.RESEND_API_KEY;
  const destino = process.env.CORREO_DESTINO;
  const origen = process.env.CORREO_ORIGEN;

  if (!clave || !destino || !origen) {
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
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clave}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: `Web JURMIA Abogados <${origen}>`,
        to: [destino],
        reply_to: email,
        subject: `Consulta ${area} — ${nombre}`,
        html
      })
    });

    if (!respuesta.ok) {
      console.error("Resend respondió", respuesta.status, await respuesta.text());
      return res.status(502).json({ error: "No se pudo enviar el correo" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error inesperado" });
  }
}
