/**
 * Resumen diario de segunda oportunidad: lo que pide atención hoy.
 *
 * Lo usan el aviso automático de cada mañana (api/lso-avisos.js, con Vercel
 * Cron) y el botón «Resumen de hoy» del panel.
 */

import { listarResumenes, leerVarios } from "./_almacen-lso.js";
import { enviarCorreo, correoConfigurado } from "./_correo.js";
import { M, hoy, despachoPorDefecto, anotar, persistir } from "./_lso.js";
import { resumenDiario, listaDocumentos } from "./_correos-lso.js";

const CERRADAS = ["descartado", "exonerado"];
const DIAS_PLAZO = 5; // días hábiles de antelación con que aparece un plazo
const DIAS_DOCUMENTACION = 7;
const MAX_RECORDATORIOS = 4;

const diasDesde = (iso, dia) => Math.floor((Date.parse(dia + "T12:00:00Z") - Date.parse(String(iso || dia).slice(0, 10) + "T12:00:00Z")) / 86400000);
const fc = (f) => String(f || "").slice(0, 10).split("-").reverse().join("/");

export async function prepararDiario({ enviar = false, recordar = false, siempre = false } = {}) {
  const dia = hoy();
  const op = { festivosExtra: despachoPorDefecto().festivos };
  const todos = await listarResumenes();
  const vivos = todos.filter((x) => !CERRADAS.includes(x.fase));

  const plazos = [];
  vivos.forEach((x) => (x.plazos || []).forEach((p) => {
    const restantes = M.habilesRestantes(dia, p.vence, op);
    if (restantes <= DIAS_PLAZO) plazos.push(Object.assign({ expediente: x.id, cliente: x.nombre, restantes }, p));
  }));
  plazos.sort((a, b) => a.restantes - b.restantes);

  const sinLlamar = vivos
    .filter((x) => x.fase === "nuevo" && !x.primerContacto)
    .sort((a, b) => Boolean(b.urgente) - Boolean(a.urgente))
    .map((x) => ({ id: x.id, nombre: x.nombre, telefono: x.telefono, prioridad: x.prioridad, urgente: x.urgente, desde: fc(x.creado) }));

  const seguimientos = vivos.filter((x) => x.proximoSeguimiento && x.proximoSeguimiento <= dia && x.fase !== "nuevo");

  const documentacion = vivos
    .filter((x) => x.fase === "documentacion" && x.docs && x.docs.ok < x.docs.total)
    .map((x) => Object.assign({ dias: diasDesde(x.faseCambiada, dia) }, x))
    .filter((x) => x.dias >= DIAS_DOCUMENTACION);

  const cuotas = vivos.filter((x) => x.cuotaVencida);

  // Recordatorio al cliente de la documentación (solo si se activa LSO_RECORDATORIOS=si).
  const recordatorios = [];
  if (recordar && process.env.LSO_RECORDATORIOS === "si" && correoConfigurado()) {
    const candidatos = vivos.filter((x) => x.fase === "documentacion" && x.email && x.docs && x.docs.ok < x.docs.total);
    for (const e of await leerVarios(candidatos.map((x) => x.id))) {
      const r = e.recordatorios || { n: 0, ultimo: "" };
      if (r.n >= MAX_RECORDATORIOS || (r.ultimo && diasDesde(r.ultimo, dia) < 7)) continue;
      if (diasDesde(e.faseCambiada, dia) < 3) continue; // margen tras pedirle la documentación
      try {
        const m = listaDocumentos(e);
        if (!m.pendientes) continue;
        await enviarCorreo({ remitente: "JURMIA Abogados", para: e.cliente.email, asunto: m.asunto, html: m.html });
        e.recordatorios = { n: r.n + 1, ultimo: dia };
        anotar(e, "Aviso automático", `Recordatorio de documentación n.º ${r.n + 1} enviado al cliente`, "email");
        await persistir(e);
        recordatorios.push(e.cliente.nombre);
      } catch (err) {
        console.error("Recordatorio de documentación no enviado a", e.id, err.message);
      }
    }
  }

  const datos = { hoy: dia, plazos, sinLlamar, seguimientos, documentacion, cuotas, recordatorios };
  const correo = resumenDiario(datos);
  let enviado = false;
  if (enviar && correoConfigurado() && (correo.total > 0 || siempre)) {
    await enviarCorreo({ remitente: "Panel JURMIA", asunto: correo.asunto, html: correo.html });
    enviado = true;
  }
  return Object.assign(datos, { total: correo.total, enviado, asunto: correo.asunto });
}
