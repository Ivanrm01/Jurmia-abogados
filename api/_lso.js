/**
 * Lógica común del módulo de Ley de Segunda Oportunidad en el servidor:
 * configuración del despacho, alta de expedientes, resumen para el listado y
 * saneado de lo que llega del panel.
 *
 * Variables de entorno propias (todas opcionales):
 *   LSO_RESPONSABLES   nombres entre comas para repartir los contactos nuevos
 *                      por turnos («Letrada A, Letrado B»). Sin ella, entran
 *                      sin asignar.
 *   LSO_TARIFAS        honorarios de referencia por vía, para la previsión:
 *                      «sin_masa:2400,liquidacion:3000,plan_pagos:3600,
 *                      microempresa:3900,complejidad:900»
 *   LSO_RECORDATORIOS  «si» para que el aviso diario recuerde también al
 *                      cliente, por correo, la documentación pendiente.
 *   DESPACHO_FESTIVOS  festivos autonómicos y locales para el cómputo de plazos:
 *                      «2026-03-19,2026-10-09» o «03-19,10-09» si se repiten.
 *   DESPACHO_TELEFONO  teléfono que figura en los correos al cliente.
 *   DESPACHO_WHATSAPP  número de WhatsApp de esos correos.
 *   CRON_SECRET        lo pone Vercel; protege el aviso diario.
 * Y las DESPACHO_* que ya usa revolving para los escritos.
 */

import "../assets/js/lso-motor.js";
import "../assets/js/lso-escritos.js";
import { guardarExpediente } from "./_almacen-lso.js";

export const M = globalThis.MotorLSO;
export const E = globalThis.EscritosLSO;

export const SITIO = (process.env.SITIO_URL || "https://www.jurmiabogados.es").replace(/\/$/, "");
export const PANEL = SITIO + "/admin/segunda-oportunidad";

export const limpio = (t, max = 200) => String(t == null ? "" : t).trim().slice(0, max);

const lista = (t) => String(t || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);

export function despachoPorDefecto() {
  return {
    nombre: process.env.DESPACHO_NOMBRE || "JURMIA Abogados",
    letrado: process.env.DESPACHO_LETRADO || "",
    procurador: process.env.DESPACHO_PROCURADOR || "",
    colegio: process.env.DESPACHO_COLEGIO || "",
    colegiado: process.env.DESPACHO_COLEGIADO || "",
    domicilio: process.env.DESPACHO_DOMICILIO || "",
    ciudad: process.env.DESPACHO_CIUDAD || "",
    email: process.env.DESPACHO_EMAIL || process.env.CORREO_DESTINO || "",
    telefono: process.env.DESPACHO_TELEFONO || "+34 667 824 641",
    whatsapp: process.env.DESPACHO_WHATSAPP || "+34 675 672 559",
    festivos: lista(process.env.DESPACHO_FESTIVOS)
  };
}

/** El expediente con los datos del despacho completados, tal como lo ven las plantillas. */
export function conDespacho(e) {
  const d = Object.assign(despachoPorDefecto(), e.despacho || {});
  // Los festivos son del partido judicial: siempre los del entorno.
  d.festivos = despachoPorDefecto().festivos;
  return Object.assign({}, e, { despacho: d });
}

export const tarifas = () => M.leerTarifas(process.env.LSO_TARIFAS);
export const responsables = () => lista(process.env.LSO_RESPONSABLES);

/** Nombres del equipo (los de ADMIN_USUARIOS y LSO_RESPONSABLES), nunca sus claves. */
export function equipo() {
  const nombres = lista(process.env.ADMIN_USUARIOS).map((linea) => {
    const p = linea.split(":");
    return (p[2] || "").trim() || (p[0] || "").trim();
  });
  return [...new Set(nombres.concat(responsables()).filter(Boolean))];
}

export function referencia() {
  const d = new Date();
  return "S" + d.toISOString().slice(2, 10).replace(/-/g, "") + "-" +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

export const hoy = (ahora = new Date()) => E.hoyMadrid(ahora);

export function anotar(e, quien, que, tipo = "nota") {
  e.historial = (e.historial || []).concat([{ fecha: new Date().toISOString(), quien, tipo, que: limpio(que, 2000) }]).slice(-150);
}

/* ------------------------------------------------------------------ */
/* Origen del contacto                                                 */
/* ------------------------------------------------------------------ */

export const FUENTES = {
  google_ads: "Google Ads",
  seo: "Google orgánico",
  meta_ads: "Facebook / Instagram",
  tiktok: "TikTok",
  referido: "Recomendación",
  colaborador: "Colaborador",
  telefono: "Llamada o visita",
  directo: "Directo"
};

export function origenDe(o) {
  o = o || {};
  const utm = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((k) => {
    if (o[k]) utm[k] = limpio(o[k], 120);
  });
  const fuenteUtm = (utm.utm_source || "").toLowerCase();
  const medio = (utm.utm_medium || "").toLowerCase();
  const ref = limpio(o.referente, 300).toLowerCase();
  let fuente = "directo";
  if (o.gclid || o.gbraid || o.wbraid || (/google/.test(fuenteUtm) && /cpc|ppc|paid|ads/.test(medio))) fuente = "google_ads";
  else if (o.fbclid || /facebook|instagram|meta|fb|ig/.test(fuenteUtm)) fuente = "meta_ads";
  else if (/tiktok/.test(fuenteUtm) || o.ttclid) fuente = "tiktok";
  else if (fuenteUtm) fuente = fuenteUtm === "referido" ? "referido" : "directo";
  else if (/google\.|bing\.|duckduckgo\.|ecosia\.|yahoo\./.test(ref)) fuente = "seo";
  return {
    fuente,
    campana: utm.utm_campaign || "",
    pagina: limpio(o.pagina, 200),
    entrada: limpio(o.entrada, 200),
    referente: limpio(o.referente, 300),
    utm,
    gclid: limpio(o.gclid, 200),
    fbclid: limpio(o.fbclid, 200)
  };
}

/* ------------------------------------------------------------------ */
/* Alta                                                                */
/* ------------------------------------------------------------------ */

export function nuevoExpediente({ cliente, respuestas, origen, consentimiento, comercial, quien, asignado, calculadora, urgente }) {
  const resultado = respuestas ? M.evaluar(respuestas, tarifas()) : null;
  const ahora = new Date().toISOString();
  const e = {
    id: referencia(),
    tipo: "lso",
    creado: ahora,
    fase: "nuevo",
    faseCambiada: ahora,
    cliente,
    respuestas: respuestas || null,
    resultado,
    origen: origen || { fuente: "directo", utm: {} },
    asignado: asignado || "",
    primerContacto: "",
    proximoSeguimiento: "",
    cita: "",
    motivoDescarte: "",
    notas: "",
    documentos: {},
    honorarios: { importe: resultado ? resultado.honorariosEstimados : 0, pagos: [] },
    judicial: null,
    acreedores: [],
    bienes: [],
    escritos: {},
    despacho: {},
    historial: [],
    comercial: Boolean(comercial),
    consentimiento: consentimiento || null,
    calculadora: calculadora || null,
    urgente: urgente || null
  };
  anotar(e, quien || "Web", resultado
    ? `Test completado: ${resultado.titulo.toLowerCase()} · ${resultado.viaTitulo} · ${M.euros(resultado.deudaEstimada)} aprox.`
    : urgente ? `Vía urgente desde la web: ${urgente.texto}` : "Alta manual del contacto", "sistema");
  if (calculadora) {
    anotar(e, quien || "Web", `Calculadora: declara ${M.euros(calculadora.total)} de deuda; se podrían cancelar unos ${M.euros(calculadora.cancelable)} (${calculadora.porcentaje} %)`, "sistema");
  }
  return e;
}

/* ------------------------------------------------------------------ */
/* Resumen para el listado y el aviso diario                           */
/* ------------------------------------------------------------------ */

const RESP_VACIAS = { tipos: [], bienes: [] };

export function documentosDe(e) {
  return e.respuestas
    ? M.documentosRequeridos(Object.assign({}, RESP_VACIAS, e.respuestas))
    : M.DOCUMENTOS.filter((d) => !d.si);
}

export function resumir(e, ahora = new Date()) {
  const x = conDespacho(e);
  const r = e.resultado || {};
  const c = e.cliente || {};
  const docs = documentosDe(e);
  const docsOk = docs.filter((d) => {
    const s = e.documentos && e.documentos[d.id] && e.documentos[d.id].estado;
    return s === "recibido" || s === "validado";
  }).length;
  const calculo = (e.acreedores || []).length
    ? M.calcularExoneracion(e.acreedores, { exoneracionPrevia: e.respuestas && e.respuestas.exoneracionPrevia === "si" })
    : null;

  let necesarios = [];
  let plazos = [];
  try {
    necesarios = E.escritosDelExpediente(x, ahora);
    plazos = E.avisosDePlazo(x, ahora).map((p) => ({
      clave: p.clave, corto: p.corto, etiqueta: p.etiqueta, estado: p.estado,
      vence: p.vence, gracia: p.gracia, aviso: p.aviso, inicio: p.inicio
    }));
  } catch (err) {
    console.error("Resumen LSO: no se pudieron calcular los escritos de", e.id, err.message);
  }
  const estados = Object.values(e.escritos || {}).map((m) => m.estado);
  const porRedactar = necesarios
    .filter((n) => n.disponible === true && !n.escrito)
    .map((n) => ({ clave: n.clave, corto: n.def.corto + (n.etiqueta ? " · " + n.etiqueta : "") }));

  const pagos = (e.honorarios && e.honorarios.pagos) || [];
  const dia = hoy(ahora);
  const cobrado = pagos.filter((p) => p.estado === "pagado").reduce((s, p) => s + (Number(p.importe) || 0), 0);

  return {
    id: e.id,
    creado: e.creado,
    actualizado: e.actualizado || e.creado,
    fase: e.fase,
    faseCambiada: e.faseCambiada || e.creado,
    nombre: c.nombre || "",
    telefono: c.telefono || "",
    email: c.email || "",
    provincia: c.provincia || "",
    fuente: (e.origen && e.origen.fuente) || "directo",
    campana: (e.origen && e.origen.campana) || "",
    encaje: r.encaje || "",
    prioridad: r.prioridad || "",
    puntuacion: r.puntuacion || 0,
    via: (e.judicial && e.judicial.via) || r.via || "",
    deuda: calculo ? calculo.pasivo : e.calculadora ? e.calculadora.total : r.deudaEstimada || 0,
    deudaReal: Boolean(calculo),
    urgente: e.urgente ? e.urgente.tipo : "",
    cancelableDeclarado: e.calculadora ? e.calculadora.cancelable : null,
    exonerable: calculo ? calculo.exonerable : null,
    asignado: e.asignado || "",
    primerContacto: e.primerContacto || "",
    proximoSeguimiento: e.proximoSeguimiento || "",
    cita: e.cita || "",
    motivoDescarte: e.motivoDescarte || "",
    docs: { total: docs.length, ok: docsOk },
    plazos,
    porRedactar,
    escritos: {
      borradores: estados.filter((s) => s === "borrador").length,
      revisados: estados.filter((s) => s === "revisado").length,
      presentados: estados.filter((s) => s === "presentado").length
    },
    enCurso: Object.keys(e.escritos || {})
      .filter((k) => e.escritos[k].estado !== "presentado")
      .map((k) => ({ clave: k, titulo: e.escritos[k].titulo, estado: e.escritos[k].estado, actualizado: e.escritos[k].actualizado })),
    honorarios: Number(e.honorarios && e.honorarios.importe) || 0,
    cobrado,
    cuotaVencida: pagos.some((p) => p.estado !== "pagado" && p.vence && p.vence < dia),
    tarjetas: Boolean(e.respuestas && (e.respuestas.tipos || []).includes("tarjetas"))
  };
}

/** Guarda el expediente y su resumen. */
export async function persistir(e) {
  e.actualizado = new Date().toISOString();
  return guardarExpediente(e, resumir(e));
}

/* ------------------------------------------------------------------ */
/* Saneado de lo que llega del panel                                   */
/* ------------------------------------------------------------------ */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const fecha = (v) => (FECHA.test(String(v || "")) ? String(v) : "");
const fechaOpc = (v) => fecha(v) || undefined;
const textoOpc = (v, max = 300) => limpio(v, max) || undefined;
/** Importe ≥ 0 con dos decimales; vacío queda sin dato (y la plantilla deja el hueco). */
const importe = (v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
};
const entero = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const uno = (v, opciones) => (opciones.includes(v) ? v : undefined);
const id = (v) => limpio(v, 40).replace(/[^\w-]/g, "") || Math.random().toString(36).slice(2, 10);

const sinVacios = (o) => {
  Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]);
  return o;
};

export function sanearJudicial(j) {
  j = j || {};
  const h = j.hitos || {};
  return sinVacios({
    tratamiento: uno(j.tratamiento, ["D.", "D.ª"]),
    dni: textoOpc(j.dni, 20),
    fechaNacimiento: fechaOpc(j.fechaNacimiento),
    domicilio: textoOpc(j.domicilio),
    codigoPostal: textoOpc(j.codigoPostal, 10),
    municipio: textoOpc(j.municipio, 120),
    estadoCivil: uno(j.estadoCivil, ["soltero", "casado", "pareja", "divorciado", "viudo"]),
    regimen: uno(j.regimen, ["gananciales", "separacion", "participacion", "otro"]),
    conyuge: textoOpc(j.conyuge),
    fechaMatrimonio: fechaOpc(j.fechaMatrimonio),
    personasACargo: entero(j.personasACargo),
    situacionLaboral: textoOpc(j.situacionLaboral),
    ingresosMensuales: importe(j.ingresosMensuales),
    gastosMensuales: importe(j.gastosMensuales),
    cuotasMensuales: importe(j.cuotasMensuales),
    causas: textoOpc(j.causas, 6000),
    via: uno(j.via, ["sin_masa", "liquidacion", "plan_pagos", "microempresa"]),
    sede: textoOpc(j.sede, 120),
    plaza: textoOpc(j.plaza, 20),
    autos: textoOpc(j.autos, 120),
    procurador: textoOpc(j.procurador, 160),
    hitos: sinVacios({
      presentacion: fechaOpc(h.presentacion),
      autoDeclaracion: fechaOpc(h.autoDeclaracion),
      sinMasa: h.sinMasa === true || h.sinMasa === "si" ? true : h.sinMasa === false || h.sinMasa === "no" ? false : undefined,
      edictoBOE: fechaOpc(h.edictoBOE),
      liquidacion: fechaOpc(h.liquidacion),
      trasladoConclusion: fechaOpc(h.trasladoConclusion),
      diasAudienciaConclusion: entero(h.diasAudienciaConclusion),
      oposicionRecepcion: fechaOpc(h.oposicionRecepcion),
      oposicionAcreedor: textoOpc(h.oposicionAcreedor, 200),
      requerimientoRecepcion: fechaOpc(h.requerimientoRecepcion),
      requerimientoDias: entero(h.requerimientoDias),
      requerimientoTexto: textoOpc(h.requerimientoTexto, 2000),
      planAprobado: fechaOpc(h.planAprobado),
      exoneracion: fechaOpc(h.exoneracion)
    })
  });
}

const TIPOS_ACREEDOR = Object.keys(M.TIPOS_ACREEDOR);

export function sanearAcreedores(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 200).map((a) => {
    const p = a.procedimiento || {};
    const conProc = limpio(p.organo) || limpio(p.autos);
    return sinVacios({
      id: id(a.id),
      nombre: limpio(a.nombre, 200) || "Acreedor sin nombre",
      nif: textoOpc(a.nif, 20),
      domicilio: textoOpc(a.domicilio),
      email: textoOpc(a.email, 160),
      tipo: uno(a.tipo, TIPOS_ACREEDOR) || "otro",
      concepto: limpio(a.concepto, 200) || "Deuda",
      principal: importe(a.principal) || 0,
      accesorios: importe(a.accesorios),
      vencimiento: fechaOpc(a.vencimiento),
      garantia: uno(a.garantia, ["ninguna", "hipoteca", "prenda", "aval"]),
      importeGarantizado: importe(a.importeGarantizado),
      procedimiento: conProc ? { organo: limpio(p.organo, 200), autos: limpio(p.autos, 120), estado: limpio(p.estado, 200) } : undefined,
      noExonerable: textoOpc(a.noExonerable, 200)
    });
  });
}

export function sanearBienes(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 100).map((b) => sinVacios({
    id: id(b.id),
    tipo: uno(b.tipo, ["vivienda", "inmueble", "vehiculo", "cuenta", "otro"]) || "otro",
    descripcion: limpio(b.descripcion, 300) || "Bien sin describir",
    identificacion: textoOpc(b.identificacion),
    valorAdquisicion: importe(b.valorAdquisicion),
    valorActual: importe(b.valorActual),
    cargas: textoOpc(b.cargas),
    necesario: b.necesario === true || b.necesario === "si" ? true : undefined
  }));
}

export function sanearPagos(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 72).map((p) => sinVacios({
    id: id(p.id),
    concepto: limpio(p.concepto, 120) || "Cuota",
    importe: importe(p.importe) || 0,
    vence: fecha(p.vence),
    estado: uno(p.estado, ["pagado", "pendiente", "fallido"]) || "pendiente",
    pagadoEn: fechaOpc(p.pagadoEn)
  }));
}

export function sanearDocumentos(docs) {
  const out = {};
  Object.keys(docs || {}).slice(0, 60).forEach((k) => {
    const d = docs[k] || {};
    const estado = uno(d.estado, ["pendiente", "recibido", "validado", "rechazado"]);
    if (!estado) return;
    out[limpio(k, 40)] = sinVacios({ estado, fecha: fechaOpc(d.fecha), nota: textoOpc(d.nota, 300) });
  });
  return out;
}

export function sanearCliente(c, previo = {}) {
  c = c || {};
  const out = Object.assign({}, previo);
  ["nombre", "telefono", "email", "provincia", "canal", "franja", "observaciones"].forEach((k) => {
    if (c[k] !== undefined) out[k] = limpio(c[k], k === "observaciones" ? 3000 : 160);
  });
  return out;
}
