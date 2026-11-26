/**
 * REGISTRO DE CONSENTIMIENTOS DE COOKIES · JURMIA Abogados
 * ---------------------------------------------------------------------------
 * El artículo 7.1 del RGPD obliga a poder DEMOSTRAR que se obtuvo el
 * consentimiento. Guardarlo solo en el navegador del visitante no sirve como
 * prueba: si borra sus datos, la prueba desaparece.
 *
 * Aquí se anota cada decisión del aviso de cookies (aceptar, rechazar o
 * guardar la selección) con:
 *   · un identificador aleatorio que genera el propio navegador,
 *   · la fecha y hora exactas,
 *   · la versión del aviso y el texto literal que se le mostró,
 *   · qué finalidades aceptó y cuáles no, y qué botón pulsó,
 *   · la página en la que estaba,
 *   · una huella irreversible de la IP y del navegador.
 *
 * NUNCA se guarda la IP en claro, ni nombre, ni correo: el registro es una
 * prueba, no un fichero de seguimiento, y no se cruza con los formularios.
 *
 * Se conserva 5 años: los 24 meses que vale cada consentimiento (assets/js/
 * cookies.js) más los 3 años de prescripción de las infracciones más graves
 * (art. 47 LSSI y art. 72 LOPDGDD). Lo anterior se borra solo.
 *
 * Redis (el mismo de los expedientes):
 *   cookies:registro   ZSET  puntuación = fecha en ms, miembro = JSON de la decisión
 *   cookies:textos     HASH  huella del texto → { version, desde, texto }
 * El texto mostrado es casi siempre el mismo, así que se guarda una vez y cada
 * decisión apunta a él: el registro ocupa una fracción de lo que ocuparía.
 */

import crypto from "node:crypto";
import { comando } from "./_almacen.js";
import { ipDe, navegadorDe } from "./_seguridad.js";

const K = { registro: "cookies:registro", textos: "cookies:textos" };

export const AÑOS_CONSERVACION = 5;
export const MAX_FILAS_CSV = 15000;   // ~3 MB: por debajo del límite de respuesta de Vercel (4,5 MB)
const PAGINA = 1000;
const MAX_BUSQUEDA = 60000;           // decisiones que se recorren para buscar a un visitante
const MAX_TEXTOS = 100;               // textos distintos que se guardan

export const VIAS = {
  "banner-aceptar": "Aviso · Aceptar todas",
  "banner-rechazar": "Aviso · Rechazar todas",
  "panel-aceptar": "Configuración · Aceptar todas",
  "panel-rechazar": "Configuración · Rechazar todas",
  "panel-guardar": "Configuración · Guardar preferencias"
};

/** Sal de las huellas. Defina CONSENT_SALT en Vercel y no la cambie nunca. */
const sal = () => process.env.CONSENT_SALT || process.env.ADMIN_SECRETO || "jurmia-abogados";
const huella = (v) =>
  v ? crypto.createHash("sha256").update(sal() + "|" + v).digest("hex").slice(0, 32) : "";
const huellaTexto = (t) => crypto.createHash("sha256").update(String(t)).digest("hex").slice(0, 16);
const txt = (v, max) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);

const parsear = (b) => {
  if (!b) return null;
  if (typeof b === "object") return b;
  try { return JSON.parse(b); } catch { return null; }
};

/** El aviso solo envía desde esta misma web. */
export function origenPropio(req) {
  const h = req.headers || {};
  const sitio = h["sec-fetch-site"];
  if (sitio && sitio !== "same-origin") return false;
  const origen = h.origin;
  if (!origen) return true; // las peticiones del mismo dominio no siempre la envían
  const hosts = [h.host, h["x-forwarded-host"]].filter(Boolean);
  try { return hosts.includes(new URL(origen).host); } catch { return false; }
}

// Freno a envíos masivos desde una misma conexión (por instancia de la función)
const envios = new Map();
function demasiados(clave) {
  const ahora = Date.now();
  const previos = (envios.get(clave) || []).filter((t) => ahora - t < 10 * 60 * 1000);
  if (previos.length >= 30) return true;
  previos.push(ahora);
  envios.set(clave, previos);
  if (envios.size > 5000) envios.clear();
  return false;
}

function limiteConservacion() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - AÑOS_CONSERVACION);
  return d.getTime();
}

export async function borrarCaducados() {
  await comando(["ZREMRANGEBYSCORE", K.registro, "-inf", "(" + limiteConservacion()]);
}

/* ===========================================================================
   Anotar una decisión (lo llama el aviso de cookies)
   =========================================================================== */
export async function anotarConsentimiento(req, body) {
  if (!origenPropio(req)) return { estado: 403, cuerpo: { error: "Origen no permitido" } };

  const ipHuella = huella(ipDe(req));
  if (demasiados(ipHuella)) return { estado: 429, cuerpo: { error: "Demasiados envíos" } };

  const { id, version, analitica, marketing, via, texto, pagina } = body || {};
  // Identificador válido: el que genera el navegador (UUID o 32 hexadecimales)
  if (!id || !/^[0-9a-f-]{16,40}$/i.test(String(id))) {
    return { estado: 400, cuerpo: { error: "Identificador no válido" } };
  }

  const ahora = new Date();
  const literal = txt(texto, 4000);
  const textoId = literal ? huellaTexto(literal) : "";
  const ver = Number.isFinite(Number(version)) ? Number(version) : 0;
  const registro = {
    f: ahora.toISOString(),
    v: String(id).toLowerCase(),
    ver,
    a: analitica === true,
    m: marketing === true,
    via: VIAS[via] ? via : txt(via, 40),
    p: txt(pagina, 300),
    t: textoId,
    ip: ipHuella,
    nav: huella(navegadorDe(req))
  };

  try {
    if (textoId && !Number(await comando(["HEXISTS", K.textos, textoId]))) {
      // El aviso real solo tiene dos textos por versión. El tope evita que alguien
      // llene la base de datos enviando textos inventados.
      if (Number(await comando(["HLEN", K.textos])) < MAX_TEXTOS) {
        await comando(["HSETNX", K.textos, textoId, JSON.stringify({ version: ver, desde: registro.f, texto: literal })]);
      } else {
        registro.t = "";
      }
    }
    await comando(["ZADD", K.registro, String(ahora.getTime()), JSON.stringify(registro)]);
    if (Math.random() < 0.01) await borrarCaducados().catch(() => {});
  } catch (e) {
    console.error("[consentimiento]", e.message);
    return { estado: 500, cuerpo: { error: "No se ha podido registrar" } };
  }
  return { estado: 200, cuerpo: { ok: true } };
}

/* ===========================================================================
   Consultas para el panel (con sesión)
   =========================================================================== */

const decision = (r) => (r.a && r.m ? "todas" : !r.a && !r.m ? "ninguna" : "parcial");

/** Cifras para la tarjeta del panel. */
export async function resumenConsentimientos() {
  const ahora = Date.now();
  const [total, ultimos30, recientes] = await Promise.all([
    comando(["ZCARD", K.registro]),
    comando(["ZCOUNT", K.registro, String(ahora - 30 * 864e5), "+inf"]),
    comando(["ZREVRANGEBYSCORE", K.registro, "+inf", "-inf", "LIMIT", "0", "500"])
  ]);
  const filas = (recientes || []).map(parsear).filter(Boolean);
  const reparto = { todas: 0, ninguna: 0, parcial: 0 };
  for (const r of filas) reparto[decision(r)]++;
  return {
    total: Number(total) || 0,
    ultimos30: Number(ultimos30) || 0,
    ultimo: filas[0] ? filas[0].f : null,
    muestra: filas.length,
    reparto,
    conservacionAnios: AÑOS_CONSERVACION
  };
}

async function textos(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const brutos = (await comando(["HMGET", K.textos, ...unicos])) || [];
  const out = {};
  unicos.forEach((id, i) => { out[id] = parsear(brutos[i]); });
  return out;
}

const publico = (r, mapaTextos) => ({
  fecha: r.f,
  identificador: r.v,
  version: r.ver,
  necesarias: true,
  analitica: r.a,
  marketing: r.m,
  decision: decision(r),
  opcion: r.via,
  opcionTexto: VIAS[r.via] || r.via,
  pagina: r.p,
  textoId: r.t,
  textoMostrado: mapaTextos && mapaTextos[r.t] ? mapaTextos[r.t].texto : undefined,
  huellaIP: r.ip,
  huellaNavegador: r.nav
});

/** Historial completo de un visitante (por el identificador guardado en su navegador). */
export async function historialDe(id) {
  const buscado = String(id || "").trim().toLowerCase();
  if (!/^[0-9a-f-]{16,40}$/.test(buscado)) return { error: "El identificador no tiene el formato correcto." };
  await borrarCaducados().catch(() => {});
  const encontrados = [];
  for (let desde = 0; desde < MAX_BUSQUEDA; desde += PAGINA) {
    const pagina = (await comando(["ZREVRANGEBYSCORE", K.registro, "+inf", "-inf", "LIMIT", String(desde), String(PAGINA)])) || [];
    for (const b of pagina) {
      const r = parsear(b);
      if (r && r.v === buscado) encontrados.push(r);
    }
    if (pagina.length < PAGINA) break;
  }
  const mapa = await textos(encontrados.map((r) => r.t));
  return { identificador: buscado, registros: encontrados.map((r) => publico(r, mapa)) };
}

/* ---------- Exportación CSV (para Excel: separador «;» y BOM) ---------- */

// Entre comillas, y con un apóstrofo delante si empieza por = + - @: así Excel nunca lo
// interpreta como fórmula (la página y la opción las envía el navegador del visitante).
const celda = (v) => {
  let t = String(v == null ? "" : v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
};
const horaMadrid = (iso) => {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  } catch { return ""; }
};

/** Minutos que Madrid va por delante de UTC en ese instante (60 en invierno, 120 en verano). */
function desfaseMadrid(ms) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).formatToParts(new Date(ms));
  const v = (t) => Number((partes.find((p) => p.type === t) || {}).value);
  return (Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - ms) / 60000;
}
const esFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) && !isNaN(Date.parse(f + "T00:00:00Z"));
/** Instante en que empieza ese día en Madrid. */
function inicioDiaMadrid(fecha) {
  const base = Date.parse(fecha + "T00:00:00Z");
  return base - desfaseMadrid(base) * 60000;
}

/** Decisiones entre dos fechas (YYYY-MM-DD, ambas incluidas, hora de Madrid), de la más reciente a la más antigua. */
export async function csvConsentimientos({ desde, hasta } = {}) {
  await borrarCaducados().catch(() => {});
  const min = esFecha(desde) ? inicioDiaMadrid(desde) : "-inf";
  const max = esFecha(hasta) ? inicioDiaMadrid(new Date(Date.parse(hasta + "T12:00:00Z") + 864e5).toISOString().slice(0, 10)) - 1 : "+inf";

  const filas = [];
  let truncado = false;
  for (let offset = 0; ; offset += PAGINA) {
    const pagina = (await comando(["ZREVRANGEBYSCORE", K.registro, String(max), String(min), "LIMIT", String(offset), String(PAGINA)])) || [];
    for (const b of pagina) {
      const r = parsear(b);
      if (!r) continue;
      if (filas.length >= MAX_FILAS_CSV) { truncado = true; break; }
      filas.push(r);
    }
    if (truncado || pagina.length < PAGINA) break;
  }

  const cab = "fecha_utc;fecha_hora_madrid;identificador;version;necesarias;analitica;marketing;decision;opcion_pulsada;pagina;texto_mostrado_id;huella_ip;huella_navegador";
  const lineas = filas.map((r) => [
    r.f, horaMadrid(r.f), r.v, r.ver, "si",
    r.a ? "si" : "no", r.m ? "si" : "no", decision(r),
    celda(VIAS[r.via] || r.via), celda(r.p), r.t, r.ip, r.nav
  ].join(";"));
  return { csv: "﻿" + [cab, ...lineas].join("\r\n") + "\r\n", filas: filas.length, truncado };
}

/** Textos literales que se han mostrado, con su identificador (columna texto_mostrado_id). */
export async function csvTextos() {
  const pares = (await comando(["HGETALL", K.textos])) || [];
  const lista = [];
  if (Array.isArray(pares)) {
    for (let i = 0; i + 1 < pares.length; i += 2) lista.push([pares[i], parsear(pares[i + 1]) || {}]);
  } else {
    for (const [k, v] of Object.entries(pares)) lista.push([k, parsear(v) || {}]);
  }
  lista.sort((a, b) => String(a[1].desde || "").localeCompare(String(b[1].desde || "")));
  const cab = "texto_mostrado_id;version;mostrado_por_primera_vez_utc;texto_literal";
  const lineas = lista.map(([id, t]) => [id, t.version ?? "", t.desde || "", celda(t.texto || "")].join(";"));
  return "﻿" + [cab, ...lineas].join("\r\n") + "\r\n";
}
