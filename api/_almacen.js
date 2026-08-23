/**
 * Almacén de expedientes.
 *
 * Se apoya en Redis por HTTP (Vercel KV o Upstash, ambos con plan gratuito),
 * de modo que no hace falta ninguna dependencia de npm ni mantener un
 * servidor de base de datos.
 *
 * Por qué no se guardan en el repositorio como los artículos del blog: un
 * expediente contiene datos personales de un cliente y el historial de Git es
 * inmutable, lo que hace prácticamente imposible atender un derecho de
 * supresión del artículo 17 del RGPD. En Redis se borra de verdad.
 *
 * Variables de entorno (cualquiera de los dos pares):
 *   KV_REST_API_URL / KV_REST_API_TOKEN                (integración Vercel KV)
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  (Upstash directo)
 */

/*
 * El almacén sirve a varias materias. Cada una vive en su propia colección,
 * con su índice y su prefijo, de modo que los expedientes de vuelos y los de
 * revolving no se mezclan ni se pisan las referencias.
 */
const COLECCIONES = {
  vuelos: { indice: "vuelos:indice", prefijo: "vuelos:exp:" },
  revolving: { indice: "revolving:indice", prefijo: "revolving:exp:" }
};

function coleccion(nombre) {
  return COLECCIONES[nombre] || COLECCIONES.vuelos;
}

function credenciales() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  return { url: url.replace(/\/$/, ""), token };
}

export function almacenDisponible() {
  const { url, token } = credenciales();
  return Boolean(url && token);
}

async function comando(partes) {
  const { url, token } = credenciales();
  if (!url || !token) throw new Error("El almacén de expedientes no está configurado.");
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(partes)
  });
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok || cuerpo.error) {
    throw new Error("Almacén: " + (cuerpo.error || respuesta.status));
  }
  return cuerpo.result;
}

/** Guarda el expediente completo y lo indexa por fecha de entrada. */
export async function guardar(expediente, materia) {
  const c = coleccion(materia || expediente.tipo);
  expediente.actualizado = new Date().toISOString();
  await comando(["SET", c.prefijo + expediente.id, JSON.stringify(expediente)]);
  await comando(["ZADD", c.indice, String(Date.parse(expediente.creado) || Date.now()), expediente.id]);
  return expediente;
}

export async function leer(id, materia) {
  const c = coleccion(materia);
  const bruto = await comando(["GET", c.prefijo + String(id)]);
  if (!bruto) return null;
  try {
    return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
  } catch {
    return null;
  }
}

/** Lista los expedientes más recientes, con los campos justos para la tabla. */
export async function listar(limite = 200, materia) {
  const c = coleccion(materia);
  const ids = await comando(["ZRANGE", c.indice, "0", String(Math.max(0, limite - 1)), "REV"]);
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const claves = ids.map((id) => c.prefijo + id);
  const brutos = await comando(["MGET", ...claves]);
  return (brutos || [])
    .map((b) => {
      try {
        return typeof b === "string" ? JSON.parse(b) : b;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .map((e) => e.tarjeta
      ? {
          // Expediente de revolving
          id: e.id,
          creado: e.creado,
          estado: e.estado,
          cliente: e.cliente ? e.cliente.nombre : "",
          entidad: e.tarjeta.entidad || "",
          anio: e.tarjeta.anio || "",
          tae: e.tarjeta.tae || 0,
          importe: e.calculo ? e.calculo.beneficioTotal : 0,
          veredicto: e.calculo ? e.calculo.veredicto : "",
          situacion: e.caso ? e.caso.situacion : ""
        }
      : {
          // Expediente de vuelos
          id: e.id,
          creado: e.creado,
          estado: e.estado,
          cliente: e.cliente ? e.cliente.nombre : "",
          vuelo: e.vuelo ? e.vuelo.numero : "",
          fecha: e.vuelo ? e.vuelo.fecha : "",
          ruta: e.vuelo ? e.vuelo.origen + "–" + e.vuelo.destino : "",
          importe: e.calculo ? e.calculo.importeTotal : 0,
          veredicto: e.calculo ? e.calculo.veredicto : "",
          verificado: Boolean(e.verificacion && e.verificacion.encontrado)
        });
}

/** Borrado real, para atender el derecho de supresión. */
export async function borrar(id, materia) {
  const c = coleccion(materia);
  await comando(["DEL", c.prefijo + String(id)]);
  await comando(["ZREM", c.indice, String(id)]);
}

/**
 * Contador simple por ventana temporal, para frenar envíos masivos.
 * Devuelve el número de envíos de esa IP en la ventana.
 */
export async function contarEnvios(ip, ventanaSegundos = 3600) {
  if (!almacenDisponible()) return 0;
  const clave = "vuelos:freno:" + String(ip || "desconocida").slice(0, 60);
  const n = await comando(["INCR", clave]);
  if (n === 1) await comando(["EXPIRE", clave, String(ventanaSegundos)]);
  return n;
}
