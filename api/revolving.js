/**
 * Recepción de casos del formulario público de tarjetas revolving.
 *
 * El análisis se repite aquí: lo que envía el navegador son datos declarados,
 * nunca el resultado. Después se guarda el expediente y se avisa al despacho.
 */

import "../assets/js/revolving-motor.js";
import { guardar, almacenDisponible, contarEnvios } from "./_almacen.js";
import { enviarCorreo, correoConfigurado } from "./_correo.js";

const M = globalThis.MotorRevolving;
const LIMITE_POR_HORA = 12;

const limpio = (t, max = 200) => String(t == null ? "" : t).trim().slice(0, max);

function referencia() {
  const d = new Date();
  return "R" + d.toISOString().slice(2, 10).replace(/-/g, "") + "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Método no permitido" });
    }

    let d = {};
    try {
      d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch {
      return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido." });
    }

    // Campo trampa: si viene relleno es un robot, y se responde bien para no dar pistas.
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
    const anio = parseInt(d.anio, 10) || 0;
    if (!anio || anio < 1990 || anio > new Date().getFullYear()) {
      return res.status(400).json({ error: "Indique el año en que se contrató la tarjeta." });
    }
    if (!limpio(d.entidad)) {
      return res.status(400).json({ error: "Indique la entidad o el nombre de la tarjeta." });
    }

    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "desconocida";
    try {
      if (almacenDisponible() && (await contarEnvios("rev:" + ip)) > LIMITE_POR_HORA) {
        return res.status(429).json({ error: "Demasiados envíos desde esta conexión. Inténtelo más tarde." });
      }
    } catch (e) {
      console.error("Freno de envíos no disponible:", e.message);
    }

    const indicios = Array.isArray(d.indicios)
      ? d.indicios.map((x) => limpio(x, 40)).filter(Boolean).slice(0, 20)
      : [];

    const calculo = M.evaluar({
      anio,
      tae: Number(d.tae) || 0,
      capitalDispuesto: Number(d.capitalDispuesto) || 0,
      totalPagado: Number(d.totalPagado) || 0,
      deudaPendiente: Number(d.deudaPendiente) || 0,
      anosPagando: Number(d.anosPagando) || 0,
      situacion: limpio(d.situacion, 20) || "viva",
      indicios
    });

    if (!calculo.ok) {
      return res.status(400).json({ error: calculo.error || "No se ha podido valorar el caso." });
    }

    const expediente = {
      id: referencia(),
      creado: new Date().toISOString(),
      estado: "nuevo",
      tipo: "revolving",
      cliente: {
        nombre: limpio(d.nombre, 120),
        telefono: limpio(d.telefono, 40),
        email: limpio(d.email, 160),
        observaciones: limpio(d.observaciones, 2000),
        dni: "", direccion: "", iban: ""
      },
      tarjeta: {
        entidad: limpio(d.entidad, 120),
        nombre: limpio(d.nombreTarjeta, 80),
        anio,
        canal: limpio(d.canal, 20),
        conservaContrato: limpio(d.contrato, 20),
        tae: Number(d.tae) || 0,
        limite: Number(d.limite) || 0,
        anosPagando: Number(d.anosPagando) || 0,
        tipoMedio: 0
      },
      caso: {
        capitalDispuesto: Number(d.capitalDispuesto) || 0,
        totalPagado: Number(d.totalPagado) || 0,
        deudaPendiente: Number(d.deudaPendiente) || 0,
        situacion: limpio(d.situacion, 20) || "viva",
        indicios
      },
      calculo,
      notas: "",
      consentimiento: {
        aceptado: true, fecha: new Date().toISOString(), ip, textoVersion: "privacidad-2026"
      }
    };

    let guardado = false;
    try {
      if (almacenDisponible()) {
        await guardar(expediente, "revolving");
        guardado = true;
      }
    } catch (e) {
      console.error("No se pudo guardar el expediente:", e.message);
    }

    try {
      await avisar(expediente, guardado);
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
      beneficio: calculo.beneficioTotal
    });
  } catch (error) {
    console.error("Revolving:", error);
    return res.status(500).json({ error: (error && error.message) || "Error inesperado en el servidor." });
  }
}

async function avisar(e, guardado) {
  if (!correoConfigurado()) return;

  const esc = (t) => String(t == null ? "" : t)
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const r = e.calculo;

  const html = `
    <h2>Nueva reclamación de tarjeta revolving — ${esc(e.id)}</h2>
    <p><strong>${esc(r.beneficioTotal)} €</strong> de beneficio estimado · vía ${esc(r.veredicto)}</p>
    <p><strong>Cliente:</strong> ${esc(e.cliente.nombre)} · ${esc(e.cliente.telefono)} · ${esc(e.cliente.email)}</p>
    <p><strong>Tarjeta:</strong> ${esc(e.tarjeta.entidad)} · contratada en ${esc(e.tarjeta.anio)} · TAE ${esc(e.tarjeta.tae || "no consta")}</p>
    <p><strong>Cifras:</strong> dispuso ${esc(r.capitalDispuesto)} €, pagó ${esc(r.totalPagado)} €, deuda pendiente ${esc(r.deudaPendiente)} €</p>
    <p><strong>Transparencia:</strong> ${esc(r.puntosTransparencia)} de ${esc(r.maximoTransparencia)} puntos · ${esc((r.indicios || []).length)} indicios</p>
    <p><strong>Situación:</strong> ${esc(r.situacion)}</p>
    ${e.cliente.observaciones ? `<p><strong>Observaciones:</strong> ${esc(e.cliente.observaciones).replace(/\n/g, "<br>")}</p>` : ""}
    <hr>
    <p>${guardado
      ? 'Abra el expediente en <a href="https://www.jurmiabogados.es/admin/revolving">el panel de revolving</a>.'
      : "<strong>Aviso: el almacén no está configurado y el expediente no se ha guardado. Estos datos solo constan en este correo.</strong>"}</p>
    <p style="font-size:12px;color:#666">Recibido el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })}</p>
  `;

  await enviarCorreo({
    remitente: "Reclamaciones JURMIA",
    asunto: `Revolving ${e.tarjeta.entidad} · ${e.calculo.beneficioTotal} € · ${e.cliente.nombre}`,
    html,
    responderA: e.cliente.email
  });
}
