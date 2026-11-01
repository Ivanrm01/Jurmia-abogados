/**
 * Almacén de los expedientes de Ley de Segunda Oportunidad.
 *
 * Usa el mismo Redis que vuelos y revolving (véase _almacen.js), con claves
 * propias para que nada se mezcle:
 *
 *   lso:indice            ZSET   id por fecha de entrada
 *   lso:exp:<id>          JSON   expediente completo (sin el texto de los escritos)
 *   lso:resumen           HASH   id → resumen para el listado y el aviso diario
 *   lso:escritos:<id>     HASH   clave del escrito → texto del borrador
 *   lso:tel:<teléfono>    texto  último expediente de ese teléfono (30 días)
 *   lso:turno             número reparto por turnos entre responsables
 *
 * El texto de los escritos va aparte porque pesa: así el listado y el aviso
 * diario leen solo lo imprescindible.
 */

import { comando, almacenDisponible } from "./_almacen.js";

const K = {
  indice: "lso:indice",
  exp: "lso:exp:",
  resumen: "lso:resumen",
  escritos: "lso:escritos:",
  tel: "lso:tel:",
  turno: "lso:turno"
};

export { almacenDisponible };

const parsear = (bruto) => {
  if (!bruto) return null;
  try {
    return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
  } catch {
    return null;
  }
};

/** HGETALL devuelve [campo, valor, campo, valor…] en Upstash; algunos clientes, un objeto. */
const pares = (r) => {
  if (!r) return [];
  if (Array.isArray(r)) {
    const out = [];
    for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i], r[i + 1]]);
    return out;
  }
  return Object.entries(r);
};

export async function guardarExpediente(e, resumen) {
  e.actualizado = new Date().toISOString();
  await comando(["SET", K.exp + e.id, JSON.stringify(e)]);
  await comando(["ZADD", K.indice, String(Date.parse(e.creado) || Date.now()), e.id]);
  if (resumen) await comando(["HSET", K.resumen, e.id, JSON.stringify(resumen)]);
  return e;
}

export async function leerExpediente(id) {
  return parsear(await comando(["GET", K.exp + String(id)]));
}

/** Todos los resúmenes, del más reciente al más antiguo. */
export async function listarResumenes() {
  const lista = pares(await comando(["HGETALL", K.resumen]))
    .map(([, v]) => parsear(v))
    .filter(Boolean);
  return lista.sort((a, b) => (a.creado < b.creado ? 1 : a.creado > b.creado ? -1 : 0));
}

/** Lee varios expedientes completos de una vez (para el aviso diario). */
export async function leerVarios(ids) {
  if (!ids.length) return [];
  const brutos = await comando(["MGET", ...ids.map((id) => K.exp + id)]);
  return (brutos || []).map(parsear).filter(Boolean);
}

export async function guardarTextoEscrito(id, clave, contenido) {
  await comando(["HSET", K.escritos + id, clave, contenido]);
}

export async function leerTextoEscrito(id, clave) {
  const t = await comando(["HGET", K.escritos + id, clave]);
  return typeof t === "string" ? t : null;
}

/** Borrado real de todo lo del expediente (derecho de supresión, art. 17 RGPD). */
export async function borrarExpediente(id, telefono) {
  await comando(["DEL", K.exp + id]);
  await comando(["DEL", K.escritos + id]);
  await comando(["HDEL", K.resumen, id]);
  await comando(["ZREM", K.indice, id]);
  if (telefono) {
    const clave = K.tel + soloDigitos(telefono);
    if ((await comando(["GET", clave])) === id) await comando(["DEL", clave]);
  }
}

export const soloDigitos = (t) => String(t || "").replace(/\D/g, "").replace(/^(00)?34(?=\d{9}$)/, "");

/** Expediente reciente del mismo teléfono, para no duplicar a quien repite el test. */
export async function expedientePorTelefono(telefono) {
  const d = soloDigitos(telefono);
  if (d.length < 9) return null;
  return (await comando(["GET", K.tel + d])) || null;
}

export async function recordarTelefono(telefono, id) {
  const d = soloDigitos(telefono);
  if (d.length < 9) return;
  await comando(["SET", K.tel + d, id, "EX", String(30 * 24 * 3600)]);
}

/** Reparto por turnos entre los responsables configurados. */
export async function siguienteTurno(responsables) {
  if (!responsables.length) return "";
  const n = await comando(["INCR", K.turno]);
  return responsables[(Number(n) - 1) % responsables.length];
}
