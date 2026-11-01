/**
 * Aviso diario de segunda oportunidad.
 *
 * Lo llama Vercel Cron cada día laborable a primera hora (véase "crons" en
 * vercel.json). Envía al despacho el resumen de plazos procesales, contactos
 * sin llamar, seguimientos, documentación atascada y cuotas vencidas y, si
 * LSO_RECORDATORIOS=si, recuerda la documentación pendiente a los clientes.
 *
 * Vercel firma la llamada con la cabecera Authorization: Bearer CRON_SECRET.
 * Sin esa variable el aviso no se ejecuta, para que nadie pueda dispararlo
 * desde fuera.
 */

import { almacenDisponible } from "./_almacen-lso.js";
import { prepararDiario } from "./_diario-lso.js";

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || (req.headers.authorization || "") !== "Bearer " + secreto) {
    return res.status(401).json({ error: "No autorizado." });
  }
  if (!almacenDisponible()) {
    return res.status(500).json({ error: "El almacén de expedientes no está configurado." });
  }
  try {
    const d = await prepararDiario({ enviar: true, recordar: true });
    return res.status(200).json({ ok: true, total: d.total, enviado: d.enviado, recordatorios: d.recordatorios.length });
  } catch (error) {
    console.error("Aviso diario LSO:", error);
    return res.status(500).json({ error: error.message });
  }
}
