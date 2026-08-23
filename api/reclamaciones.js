/**
 * Recepción de casos del formulario público de reclamación de vuelos.
 *
 * El cálculo se repite aquí: lo que envía el navegador son datos declarados,
 * nunca el importe. Después se guarda el expediente y se avisa al despacho.
 *
 * Variables de entorno:
 *   KV_REST_API_URL / KV_REST_API_TOKEN   almacén de expedientes
 *   RESEND_API_KEY, CORREO_DESTINO, CORREO_ORIGEN   aviso por correo (ya en uso)
 */

import "../assets/js/aeropuertos.js";
import "../assets/js/vuelos-motor.js";
import { guardar, almacenDisponible, contarEnvios } from "./_almacen.js";

const M = globalThis.MotorVuelos;

const LIMITE_POR_HORA = 12;

function referencia() {
  const d = new Date();
  const dia = d.toISOString().slice(2, 10).replace(/-/g, "");
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
  return "V" + dia + "-" + azar;
}

const limpio = (t, max = 200) => String(t == null ? "" : t).trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

  // Campo trampa: si viene relleno es un robot. Se responde bien para no dar pistas.
  if (d.empresa) return res.status(200).json({ ok: true, referencia: referencia() });

  if (!d.consentimiento) {
    return res.status(400).json({ error: "Falta el consentimiento para tratar los datos." });
  }
  if (!limpio(d.nombre) || !limpio(d.telefono) || !limpio(d.email)) {
    return res.status(400).json({ error: "Faltan los datos de contacto." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio(d.email))) {
    return res.status(400).json({ error: "El correo electrónico no es válido." });
  }

  const fecha = limpio(d.fecha, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha + "T00:00:00Z"))) {
    return res.status(400).json({ error: "Falta la fecha del vuelo o no tiene un formato válido." });
  }
  if (fecha > new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ error: "La fecha del vuelo no puede ser futura." });
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconocida";
  try {
    if (almacenDisponible() && (await contarEnvios(ip)) > LIMITE_POR_HORA) {
      return res.status(429).json({ error: "Demasiados envíos desde esta conexión. Inténtelo más tarde." });
    }
  } catch (e) {
    console.error("Freno de envíos no disponible:", e.message);
  }

  // Cálculo en servidor: el navegador no decide el importe.
  const calculo = M.evaluar({
    origen: limpio(d.origen, 3).toUpperCase(),
    destino: limpio(d.destino, 3).toUpperCase(),
    incidencia: limpio(d.incidencia, 20) || "retraso",
    minutos: parseInt(d.minutos, 10) || 0,
    avisoDias: parseInt(d.avisoDias, 10) || 0,
    reubicacionAjustada: d.reubicacionAjustada === true,
    causa: limpio(d.causa, 20) || "ninguna",
    companiaUE: d.companiaUE !== false,
    pasajeros: parseInt(d.pasajeros, 10) || 1,
    gastos: Number(d.gastos) || 0
  });

  if (!calculo.ok) {
    return res.status(400).json({ error: calculo.error || "No se ha podido valorar el caso." });
  }

  const tarjeta = d.tarjeta ? M.leerTarjeta(d.tarjeta) : { ok: false };

  const expediente = {
    id: referencia(),
    creado: new Date().toISOString(),
    estado: "nuevo",
    origenEntrada: "web",
    cliente: {
      nombre: limpio(d.nombre, 120),
      telefono: limpio(d.telefono, 40),
      email: limpio(d.email, 160),
      observaciones: limpio(d.observaciones, 2000),
      dni: "",
      direccion: "",
      iban: ""
    },
    vuelo: {
      numero: limpio(d.vuelo, 12).toUpperCase(),
      aerolinea: limpio(d.aerolinea, 80),
      fecha,
      origen: calculo.origen.iata,
      destino: calculo.destino.iata,
      localizador: tarjeta.ok ? tarjeta.localizador : "",
      pasajeroTarjeta: tarjeta.ok ? tarjeta.pasajero : "",
      horaLlegadaPrevista: "",
      companiaUE: d.companiaUE !== false
    },
    caso: {
      incidencia: calculo.incidencia,
      minutos: calculo.minutos,
      avisoDias: parseInt(d.avisoDias, 10) || 0,
      reubicacionAjustada: d.reubicacionAjustada === true,
      causa: calculo.causa.id,
      pasajeros: calculo.pasajeros,
      gastos: calculo.gastos
    },
    calculo,
    verificacion: null,
    notas: "",
    consentimiento: {
      aceptado: true,
      fecha: new Date().toISOString(),
      ip,
      textoVersion: "privacidad-2026"
    }
  };

  let guardado = false;
  try {
    if (almacenDisponible()) {
      await guardar(expediente);
      guardado = true;
    }
  } catch (e) {
    console.error("No se pudo guardar el expediente:", e.message);
  }

  // Aviso al despacho. Si falla, el expediente ya está guardado.
  try {
    await avisarPorCorreo(expediente, guardado);
  } catch (e) {
    console.error("No se pudo enviar el aviso:", e.message);
  }

  if (!guardado) {
    console.error("EXPEDIENTE SIN ALMACENAR:", JSON.stringify(expediente).slice(0, 2000));
  }

  return res.status(200).json({
    ok: true,
    referencia: expediente.id,
    viable: calculo.viable,
    importe: calculo.importeTotal
  });
}

async function avisarPorCorreo(e, guardado) {
  const clave = process.env.RESEND_API_KEY;
  const destino = process.env.CORREO_DESTINO;
  const origen = process.env.CORREO_ORIGEN;
  if (!clave || !destino || !origen) return;

  const esc = (t) =>
    String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const r = e.calculo;
  const html = `
    <h2>Nueva reclamación de vuelo — ${esc(e.id)}</h2>
    <p><strong>${esc(r.importeTotal)} €</strong> · ${esc(r.veredicto)} · probabilidad estimada ${Math.round(r.probabilidad * 100)} %</p>
    <p><strong>Cliente:</strong> ${esc(e.cliente.nombre)} · ${esc(e.cliente.telefono)} · ${esc(e.cliente.email)}</p>
    <p><strong>Vuelo:</strong> ${esc(e.vuelo.numero)} · ${esc(e.vuelo.fecha)} · ${esc(e.vuelo.origen)}–${esc(e.vuelo.destino)} · ${esc(e.vuelo.aerolinea)}</p>
    <p><strong>Incidencia:</strong> ${esc(e.caso.incidencia)} · ${esc(r.minutos)} min · ${esc(e.caso.pasajeros)} pasajero(s)</p>
    <p><strong>Causa alegada:</strong> ${esc(r.causa.etiqueta)}</p>
    ${e.cliente.observaciones ? `<p><strong>Observaciones:</strong> ${esc(e.cliente.observaciones).replace(/\n/g, "<br>")}</p>` : ""}
    <hr>
    <p>${guardado ? 'Abra el expediente en <a href="https://www.jurmiabogados.es/admin/vuelos">el panel de reclamaciones</a>.' : "<strong>Aviso: el almacén no está configurado, el expediente no se ha guardado. Estos datos solo constan en este correo.</strong>"}</p>
    <p style="font-size:12px;color:#666">Recibido el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p>
  `;

  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Reclamaciones JURMIA <${origen}>`,
      to: [destino],
      reply_to: e.cliente.email,
      subject: `Vuelo ${e.vuelo.numero || "—"} · ${e.calculo.importeTotal} € · ${e.cliente.nombre}`,
      html
    })
  });
  if (!respuesta.ok) throw new Error("Resend respondió " + respuesta.status);
}
