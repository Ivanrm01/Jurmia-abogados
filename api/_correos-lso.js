/**
 * Correos del módulo de segunda oportunidad.
 *
 * Al despacho: aviso de cada contacto nuevo y resumen diario.
 * Al cliente: acuse con el resultado del test, lista de documentos pendientes y
 * aviso de cada avance del expediente. Todos salen del buzón de IONOS del
 * despacho (véase _correo.js).
 */

import { M, E, SITIO, PANEL, FUENTES, despachoPorDefecto, documentosDe } from "./_lso.js";

export const esc = (t) => String(t == null ? "" : t)
  .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const TINTA = "#06365a";
const GRIS = "#35617f";

/** Marco común: sobrio, legible en el móvil y sin imágenes remotas. */
function marco(cuerpo, pie = "") {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#042439">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #d5dde1">
<div style="background:#042439;color:#fff;padding:16px 22px;font-size:15px;letter-spacing:.08em;font-weight:bold">JURMIA ABOGADOS</div>
<div style="padding:22px;font-size:15px;line-height:1.6">${cuerpo}</div>
${pie ? `<div style="padding:14px 22px;border-top:1px solid #e6ebed;font-size:12px;line-height:1.5;color:${GRIS}">${pie}</div>` : ""}
</div></body></html>`;
}

const boton = (href, texto) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="display:inline-block;background:${TINTA};color:#fff;text-decoration:none;padding:12px 18px;font-weight:bold">${esc(texto)}</a></p>`;

const telefonoE164 = (t) => String(t || "").replace(/[^\d+]/g, "");
const whatsapp = (t) => {
  const d = String(t || "").replace(/\D/g, "");
  return "https://wa.me/" + (d.length === 9 ? "34" + d : d);
};

function pieCliente() {
  const d = despachoPorDefecto();
  return `JURMIA Abogados · ${esc(d.telefono)} · <a href="mailto:${esc(d.email || "info@jurmiabogados.es")}" style="color:${GRIS}">${esc(d.email || "info@jurmiabogados.es")}</a><br>
Recibe este correo porque nos ha pedido que estudiemos su caso. Sus datos se tratan conforme a nuestra
<a href="${SITIO}/privacidad" style="color:${GRIS}">política de privacidad</a> y quedan amparados por el secreto profesional.
Puede pedirnos en cualquier momento que los borremos respondiendo a este correo.`;
}

const saludo = (e) => {
  const nombre = ((e.cliente && e.cliente.nombre) || "").split(/\s+/)[0];
  return nombre ? `Hola, ${esc(nombre)}:` : "Hola:";
};

const FRANJAS = { manana: "por la mañana", tarde: "por la tarde", indiferente: "" };

/* ------------------------------------------------------------------ */
/* Al cliente                                                          */
/* ------------------------------------------------------------------ */

const COLOR_ESTADO = { si: "#1c6b4b", parcial: "#8a5a12", no: "#a12a2a", revisar: GRIS };
const MARCA_ESTADO = { si: "Se cancela", parcial: "Con límites", no: "No se cancela", revisar: "Lo revisamos" };

/** Tabla de la calculadora para los correos. */
function tablaCalculo(calc) {
  if (!calc || !calc.total) return "";
  return `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:8px 0 6px">
${calc.lineas.map((l) => `<tr><td style="padding:6px 8px 6px 0;border-bottom:1px solid #eef1f3;vertical-align:top"><strong>${esc(l.nombre)}</strong><br><span style="color:${GRIS}">${esc(l.motivo)}</span></td>
<td style="padding:6px 0;border-bottom:1px solid #eef1f3;text-align:right;white-space:nowrap;vertical-align:top">${esc(M.euros(l.total))}<br><span style="color:${COLOR_ESTADO[l.estado]};font-weight:bold">${l.cancelable ? "cancela " + esc(M.euros(l.cancelable)) : "no se cancela"}</span></td></tr>`).join("")}
<tr><td style="padding:8px 8px 0 0"><strong>Total</strong></td><td style="padding:8px 0 0;text-align:right;white-space:nowrap"><strong>${esc(M.euros(calc.cancelable))} de ${esc(M.euros(calc.total))}</strong></td></tr></table>`;
}

/**
 * Acuse al cliente: su informe personalizado. Es lo que recibe a cambio de
 * dejarnos sus datos, así que tiene que valer por sí mismo.
 */
export function acuseCliente(e) {
  const r = e.resultado;
  const d = despachoPorDefecto();
  const franja = FRANJAS[(e.cliente && e.cliente.franja) || ""] || "";
  const primeros = documentosDe(e).slice(0, 6);
  const tipos = ((e.respuestas && e.respuestas.tipos) || []).map((t) => M.SEMAFORO_TIPOS[t]).filter(Boolean);
  const pasos = r ? M.HOJA_DE_RUTA[r.via] || [] : [];
  const calc = e.calculadora;
  const titulo = (t) => `<h3 style="font-size:16px;margin:26px 0 8px;padding-top:14px;border-top:1px solid #e6ebed">${t}</h3>`;
  const cuerpo = `
<p>${saludo(e)}</p>
<p>Este es su informe sobre la Ley de Segunda Oportunidad, preparado con lo que nos ha contado. Su referencia es <strong>${esc(e.id)}</strong>.</p>
${r ? `<div style="border-left:3px solid ${TINTA};background:#e6ebed;padding:12px 14px;margin:18px 0">
<strong>${esc(r.titulo)}</strong><br>
<span style="color:${GRIS}">Vía más probable: ${esc(r.viaTitulo)}</span></div>
<p>${esc(r.resumen)}</p>` : ""}
${calc ? `${titulo("Cuánto podría cancelar")}
<p style="margin:0 0 4px">Con los importes que nos indicó, se podrían cancelar unos <strong>${esc(M.euros(calc.cancelable))}</strong> de sus ${esc(M.euros(calc.total))} de deuda (${calc.porcentaje} %).</p>
${tablaCalculo(calc)}
${calc.perdidaEspera ? `<p style="font-size:13px;color:#a12a2a">Lo que se embarga antes de declarar el concurso no se devuelve: en seis meses serían unos ${esc(M.euros(calc.perdidaEspera))}.</p>` : ""}` : ""}
${tipos.length ? `${titulo("Sus deudas, una a una")}
<table style="border-collapse:collapse;width:100%;font-size:13px">${tipos.map((t) => `<tr><td style="padding:6px 8px 6px 0;border-bottom:1px solid #eef1f3;vertical-align:top"><strong>${esc(t.texto)}</strong><br><span style="color:${GRIS}">${esc(t.detalle)}</span></td>
<td style="padding:6px 0;border-bottom:1px solid #eef1f3;text-align:right;vertical-align:top;white-space:nowrap;color:${COLOR_ESTADO[t.estado]};font-weight:bold">${MARCA_ESTADO[t.estado]}</td></tr>`).join("")}</table>` : ""}
${pasos.length ? `${titulo("Cómo sería su procedimiento")}
<ol style="padding-left:20px;margin:0">${pasos.map((x) => `<li style="margin-bottom:8px"><strong>${esc(x.titulo)}</strong><br><span style="color:${GRIS};font-size:13px">${esc(x.texto)}</span></li>`).join("")}</ol>` : ""}
${titulo("Lo que puede ir reuniendo")}
<ul style="padding-left:20px;margin:0 0 10px">${primeros.map((x) => `<li style="margin-bottom:6px"><strong>${esc(x.nombre)}</strong><br><span style="color:${GRIS};font-size:13px">${esc(x.comoConseguirlo)}</span></li>`).join("")}</ul>
<p>No hace falta que nos los envíe todavía: lo vemos juntos en la consulta.</p>
${titulo("Siguiente paso")}
<p>Un abogado del despacho le llamará${franja ? " " + franja : ""} en un plazo de 24 horas laborables para revisar su caso con usted.
La primera consulta es gratuita y sin compromiso, y si decide seguir le daremos el precio cerrado por escrito antes de empezar.</p>
${boton(whatsapp(d.whatsapp), "Escribirnos por WhatsApp")}
<p style="font-size:13px;color:${GRIS}">Si prefiere llamar: <a href="tel:${esc(telefonoE164(d.telefono))}" style="color:${TINTA}">${esc(d.telefono)}</a>.
Este informe es orientativo y no constituye asesoramiento jurídico: parte de lo que usted nos ha contado y da por hecho que cumple los requisitos de buena fe. La valoración definitiva la hace el abogado con su documentación.</p>`;
  return {
    asunto: `Su informe de Segunda Oportunidad · ${e.id}`,
    html: marco(cuerpo, pieCliente())
  };
}

export function listaDocumentos(e, nota) {
  const pendientes = M.documentosPendientes(
    Object.assign({ tipos: [], bienes: [] }, e.respuestas || {}),
    e.documentos || {}
  ).filter((x) => documentosDe(e).some((y) => y.id === x.id));
  const recibidos = documentosDe(e).length - pendientes.length;
  const cuerpo = `
<p>${saludo(e)}</p>
<p>Para preparar su solicitud necesitamos ${pendientes.length === 1 ? "este documento" : `estos ${pendientes.length} documentos`}${recibidos ? ` (ya tenemos ${recibidos})` : ""}:</p>
<ol style="padding-left:20px;margin:0 0 14px">${pendientes.map((x) => {
    const nota = e.documentos && e.documentos[x.id] && e.documentos[x.id].estado === "rechazado" && e.documentos[x.id].nota;
    return `<li style="margin-bottom:8px"><strong>${esc(x.nombre)}</strong><br><span style="color:${GRIS};font-size:13px">${esc(x.comoConseguirlo)}</span>${nota ? `<br><span style="color:#a12a2a;font-size:13px">Hay que repetirlo: ${esc(nota)}</span>` : ""}</li>`;
  }).join("")}</ol>
${nota ? `<p>${esc(nota).replace(/\n/g, "<br>")}</p>` : ""}
<p>Puede enviárnoslos respondiendo a este correo, con una foto o un PDF de cada uno, o por el canal que le haya indicado su abogado.
Si alguno le da problemas, díganoslo y le ayudamos a conseguirlo.</p>
<p style="font-size:13px;color:${GRIS}">Referencia de su expediente: ${esc(e.id)}</p>`;
  return {
    asunto: `Documentación pendiente para su expediente ${e.id}`,
    html: marco(cuerpo, pieCliente()),
    pendientes: pendientes.length
  };
}

const AVANCES = {
  contratado: "Hemos abierto su expediente. A partir de ahora le iremos pidiendo la documentación y le contaremos cada paso.",
  documentacion: "Estamos reuniendo la documentación de su expediente. Le enviaremos la lista de lo que falta.",
  preparacion: "Ya tenemos lo necesario: el equipo jurídico está redactando su solicitud de concurso y la relación de acreedores.",
  presentado: "Hemos presentado su solicitud en el juzgado. Ahora toca esperar a que la admita; le avisaremos en cuanto haya novedades.",
  concurso: "El juzgado ha declarado el concurso. Por regla general, desde ahora se suspenden los embargos y las ejecuciones contra su patrimonio.",
  exonerado: "El juzgado ha concedido la exoneración de sus deudas. Enhorabuena: es el final del camino que empezamos juntos."
};

export function avisoAvance(e) {
  const f = M.FASES.find((x) => x.id === e.fase);
  const texto = AVANCES[e.fase];
  if (!f || !texto) return null;
  const cuerpo = `
<p>${saludo(e)}</p>
<p>Su expediente <strong>${esc(e.id)}</strong> ha avanzado:</p>
<div style="border-left:3px solid ${TINTA};background:#e6ebed;padding:12px 14px;margin:18px 0"><strong>${esc(f.nombreCliente)}</strong></div>
<p>${esc(texto)}</p>
<p>Si tiene cualquier duda, responda a este correo o llámenos.</p>`;
  return { asunto: `Su expediente avanza: ${f.nombreCliente}`, html: marco(cuerpo, pieCliente()) };
}

/* ------------------------------------------------------------------ */
/* Al despacho                                                         */
/* ------------------------------------------------------------------ */

const ETIQUETA_PRIORIDAD = { caliente: "PRIORITARIO", templado: "Interesante", frio: "A estudiar" };

export function avisoDespacho(e, { guardado, repetido }) {
  const r = e.resultado || {};
  const u = e.urgente;
  const c = e.cliente || {};
  const respuestas = e.respuestas || {};
  const filas = M.preguntasVisibles(respuestas).filter((p) => respuestas[p.id] !== undefined).map((p) => {
    const v = [].concat(respuestas[p.id]).map((x) => (p.opciones.find((o) => o.valor === x) || {}).texto || x).join(", ");
    return `<tr><td style="padding:4px 8px 4px 0;color:${GRIS};vertical-align:top">${esc(p.titulo)}</td><td style="padding:4px 0;vertical-align:top">${esc(v)}</td></tr>`;
  }).join("");
  const puntos = (r.puntos || []).filter((p) => p.tipo !== "ok").map((p) =>
    `<li style="margin-bottom:4px">${p.tipo === "bloqueo" ? "⛔ " : "⚠️ "}${esc(p.texto)}</li>`).join("");
  const o = e.origen || {};
  const cuerpo = `
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.1em;color:${u ? "#a12a2a" : GRIS}">SEGUNDA OPORTUNIDAD · ${u ? "URGENTE" : esc(ETIQUETA_PRIORIDAD[r.prioridad] || "Nuevo")}${repetido ? " · YA NOS HABÍA ESCRITO" : ""}</p>
<h2 style="margin:0 0 4px;font-size:20px">${esc(c.nombre)}</h2>
${u ? `<p style="margin:8px 0 12px;background:#fbf1f1;border-left:3px solid #a12a2a;padding:10px 12px"><strong>${esc(u.texto)}</strong><br>Ha pedido que le llamemos hoy${e.resultado ? "" : ", sin hacer el test"}.</p>` : ""}
${e.resultado ? `<p style="margin:0 0 14px;color:${GRIS}">${esc({ alto: "Encaja", medio: "Puede encajar", estudio: "Hay que estudiarlo" }[r.encaje] || "")} · ${esc(r.viaTitulo || "")} · ${esc(M.euros(r.deudaEstimada || 0))} aprox. · ${esc(r.puntuacion || 0)}/100</p>` : ""}
<p style="margin:0 0 4px"><a href="tel:${esc(telefonoE164(c.telefono))}" style="color:${TINTA};font-weight:bold">${esc(c.telefono)}</a>
 · <a href="${whatsapp(c.telefono)}" style="color:${TINTA}">WhatsApp</a>${c.email ? ` · <a href="mailto:${esc(c.email)}" style="color:${TINTA}">${esc(c.email)}</a>` : ""}</p>
<p style="margin:0 0 14px;color:${GRIS};font-size:13px">${esc(c.provincia || "Provincia sin indicar")} · prefiere ${esc({ llamada: "llamada", whatsapp: "WhatsApp", email: "correo" }[c.canal] || "llamada")}${FRANJAS[c.franja] ? " " + FRANJAS[c.franja] : ""}${e.asignado ? ` · asignado a ${esc(e.asignado)}` : ""}</p>
${c.observaciones ? `<p style="background:#f4f6f7;padding:10px 12px"><strong>Nos cuenta:</strong> ${esc(c.observaciones).replace(/\n/g, "<br>")}</p>` : ""}
${e.calculadora ? `<p style="margin:14px 0 4px"><strong>Calculadora: se podrían cancelar ${esc(M.euros(e.calculadora.cancelable))} de ${esc(M.euros(e.calculadora.total))}</strong></p>${tablaCalculo(e.calculadora)}${e.calculadora.datos.embargoMensual ? `<p style="font-size:13px;margin:0">Le embargan ${esc(M.euros(e.calculadora.datos.embargoMensual))} al mes.</p>` : ""}` : ""}
${puntos ? `<p style="margin:14px 0 4px"><strong>Puntos a revisar</strong></p><ul style="padding-left:18px;margin:0">${puntos}</ul>` : ""}
${filas ? `<p style="margin:16px 0 4px"><strong>Respuestas del test</strong></p>
<table style="border-collapse:collapse;font-size:13px">${filas}</table>` : ""}
<p style="margin:14px 0 0;font-size:12px;color:${GRIS}">Origen: ${esc(FUENTES[o.fuente] || o.fuente || "directo")}${o.campana ? " · campaña " + esc(o.campana) : ""}${o.entrada ? " · entró por " + esc(o.entrada) : ""}</p>
${guardado ? boton(PANEL + "#" + e.id, "Abrir en el panel") : `<p style="color:#a12a2a"><strong>Aviso: el almacén no está configurado y el contacto no se ha guardado. Estos datos solo constan en este correo.</strong></p>`}`;
  return {
    asunto: u
      ? `[URGENTE] Segunda Oportunidad · ${c.nombre} · ${u.texto}`
      : `${r.prioridad === "caliente" ? "[PRIORITARIO] " : ""}Segunda Oportunidad · ${c.nombre} · ${M.euros((e.calculadora && e.calculadora.total) || r.deudaEstimada || 0)} · ${r.viaTitulo || "Contacto nuevo"}`,
    html: marco(cuerpo, `Recibido el ${new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} · referencia ${esc(e.id)}`)
  };
}

const fc = (f) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "");

/** Resumen diario de lo que pide atención. */
export function resumenDiario(d) {
  const bloque = (titulo, filas, vacio) => `
<h3 style="font-size:15px;margin:22px 0 8px;border-bottom:1px solid #e6ebed;padding-bottom:6px">${esc(titulo)} <span style="color:${GRIS};font-weight:normal">(${filas.length})</span></h3>
${filas.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px">${filas.join("")}</table>` : `<p style="color:${GRIS};font-size:13px;margin:0">${esc(vacio)}</p>`}`;
  const fila = (id, a, b, c) => `<tr>
<td style="padding:6px 8px 6px 0;border-bottom:1px solid #f0f3f4;vertical-align:top"><a href="${PANEL}#${esc(id)}" style="color:${TINTA};font-weight:bold;text-decoration:none">${esc(a)}</a></td>
<td style="padding:6px 8px;border-bottom:1px solid #f0f3f4;vertical-align:top">${b}</td>
<td style="padding:6px 0;border-bottom:1px solid #f0f3f4;vertical-align:top;text-align:right;white-space:nowrap;color:${GRIS}">${c}</td></tr>`;

  const plazos = d.plazos.map((p) => fila(p.expediente, p.cliente,
    `${esc(p.corto)}${p.etiqueta ? " · " + esc(p.etiqueta) : ""}${p.estado !== "pendiente" ? ` <span style="color:${GRIS}">(${esc(p.estado)})</span>` : ""}`,
    `${p.restantes < 0 ? '<b style="color:#a12a2a">Vencido</b>' : p.restantes === 0 ? '<b style="color:#a12a2a">Vence hoy</b>' : `<b>${p.restantes} día${p.restantes === 1 ? "" : "s"} háb.</b>`}<br>${fc(p.vence)} · gracia ${fc(p.gracia)}`));
  const nuevos = d.sinLlamar.map((x) => fila(x.id, x.nombre, `${esc(x.telefono)} · ${x.urgente ? '<b style="color:#a12a2a">URGENTE</b>' : esc(ETIQUETA_PRIORIDAD[x.prioridad] || "")}`, `desde ${esc(x.desde)}`));
  const seguimientos = d.seguimientos.map((x) => fila(x.id, x.nombre, `${esc(x.telefono)} · ${esc((M.FASES.find((f) => f.id === x.fase) || {}).nombre || x.fase)}`, fc(x.proximoSeguimiento)));
  const docs = d.documentacion.map((x) => fila(x.id, x.nombre, `${x.docs.ok} de ${x.docs.total} documentos`, `${x.dias} días en esta fase`));
  const cuotas = d.cuotas.map((x) => fila(x.id, x.nombre, esc(x.telefono), "cuota vencida"));
  const recordatorios = d.recordatorios.length
    ? `<p style="font-size:13px;color:${GRIS};margin-top:22px">Hoy se ha recordado la documentación por correo a: ${d.recordatorios.map(esc).join(", ")}.</p>` : "";

  const total = plazos.length + nuevos.length + seguimientos.length + docs.length + cuotas.length;
  const cuerpo = `
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.1em;color:${GRIS}">SEGUNDA OPORTUNIDAD · RESUMEN DEL ${esc(fc(d.hoy))}</p>
<h2 style="margin:0 0 10px;font-size:20px">${total ? `${total} asunto${total === 1 ? "" : "s"} piden atención hoy` : "Nada urgente hoy"}</h2>
${bloque("Plazos procesales", plazos, "Ningún plazo vence en los próximos días.")}
${bloque("Contactos sin llamar", nuevos, "Todos los contactos nuevos tienen ya una primera llamada.")}
${bloque("Seguimientos para hoy", seguimientos, "No hay seguimientos programados para hoy.")}
${bloque("Documentación atascada", docs, "Ningún expediente lleva más de una semana esperando papeles.")}
${bloque("Cuotas vencidas", cuotas, "No hay cuotas vencidas.")}
${recordatorios}
${boton(PANEL, "Abrir el panel")}`;
  return {
    asunto: `Segunda Oportunidad · ${d.plazos.filter((p) => p.restantes <= 2).length ? "⚠ plazos que vencen · " : ""}${total} asunto${total === 1 ? "" : "s"} para hoy`,
    html: marco(cuerpo, "Este resumen se envía cada día laborable a primera hora. Los plazos se calculan en días hábiles con los festivos configurados en DESPACHO_FESTIVOS."),
    total
  };
}

export { E };
