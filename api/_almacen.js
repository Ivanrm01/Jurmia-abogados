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
 *
 * Los expedientes de segunda oportunidad usan sus propias claves «lso:…»,
 * gestionadas en api/_almacen-lso.js sobre el mismo comando().
 */
const COLECCIONES = {
  vuelos: { indice: "vuelos:indice", prefijo: "vuelos:exp:" },
  revolving: { indice: "revolving:indice", prefijo: "revolving:exp:" }
};

function coleccion(nombre) {
  return COLECCIONES[nombre] || COLECCIONES.vuelos;
}

function credenciales() {
  // Se recortan espacios y comillas: al pegar el valor en Vercel es fácil
  // arrastrar un salto de línea o unas comillas que rompen la dirección.
  const sinAdornos = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();
  const url = sinAdornos(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const token = sinAdornos(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  return { url: url.replace(/\/+$/, ""), token };
}

export function almacenDisponible() {
  const { url, token } = credenciales();
  return Boolean(url && token);
}

/**
 * Comprueba que la dirección es la REST (https://…upstash.io) y no la de
 * conexión directa (redis:// o rediss://), que fetch no sabe abrir y que
 * produce un «fetch failed» sin más explicación.
 */
function comprobarUrl(url) {
  if (/^rediss?:\/\//i.test(url)) {
    throw new Error(
      "La variable KV_REST_API_URL contiene una dirección redis:// (conexión directa). " +
      "Hace falta la dirección REST, que empieza por https:// y termina en upstash.io. " +
      "Está en Upstash → su base de datos → REST API."
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("La variable KV_REST_API_URL no es una dirección válida: debe empezar por https://.");
  }
}

/** Traduce el fallo de red de fetch («fetch failed») a una causa entendible. */
function explicarFalloDeRed(error, url) {
  const causa = (error && error.cause) || {};
  const codigo = causa.code || causa.name || (error && error.name) || "";
  let host = "";
  try { host = new URL(url).host; } catch { /* dirección rara: ya se avisa en comprobarUrl */ }
  const donde = host ? ` (${host})` : "";
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") {
    return `No se encuentra el servidor del almacén${donde}. La dirección de KV_REST_API_URL no existe: ` +
      "o está mal copiada o la base de datos de Redis se ha borrado o archivado en Upstash.";
  }
  if (codigo === "TimeoutError" || codigo === "AbortError" || codigo === "UND_ERR_CONNECT_TIMEOUT") {
    return `El almacén de expedientes${donde} no responde (tiempo de espera agotado). Pruebe de nuevo en unos minutos.`;
  }
  if (codigo === "ECONNREFUSED") {
    return `El almacén de expedientes${donde} rechaza la conexión. Compruebe que la base de datos de Upstash está activa.`;
  }
  if (/CERT|SSL|TLS/i.test(String(codigo) + " " + (causa.message || ""))) {
    return `No se pudo establecer una conexión segura con el almacén${donde}: ${causa.message || codigo}.`;
  }
  return `No se pudo conectar con el almacén de expedientes${donde}: ${causa.message || codigo || (error && error.message) || "error de red"}.`;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ejecuta un comando de Redis. Lo reutiliza el almacén de segunda oportunidad.
 *
 * Si la conexión falla (no el comando), se reintenta dos veces: en Vercel es
 * habitual que la primera petición tras un rato de inactividad reutilice un
 * socket que el servidor ya ha cerrado («other side closed»).
 */
export async function comando(partes) {
  const { url, token } = credenciales();
  if (!url || !token) throw new Error("El almacén de expedientes no está configurado.");
  comprobarUrl(url);

  const ESPERAS = [0, 250, 800];
  let ultimoFallo = null;
  for (const ms of ESPERAS) {
    if (ms) await esperar(ms);
    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(partes),
        signal: AbortSignal.timeout(6000)
      });
    } catch (error) {
      ultimoFallo = error;
      const codigo = (error && error.cause && error.cause.code) || (error && error.name);
      console.warn("Almacén: fallo de red", codigo || "", (error && error.cause && error.cause.message) || (error && error.message));
      // Una dirección que no existe no va a aparecer por insistir, y tras un
      // tiempo de espera agotado reintentar haría que la función de Vercel
      // superase su propio límite de duración.
      if (codigo === "ENOTFOUND" || codigo === "TimeoutError" || codigo === "AbortError") break;
      continue;
    }
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (respuesta.status === 401 || respuesta.status === 403) {
      throw new Error("El almacén rechaza el token (HTTP " + respuesta.status + "). Revise KV_REST_API_TOKEN en Vercel: debe ser el token de lectura y escritura, no el de solo lectura.");
    }
    if (!respuesta.ok || cuerpo.error) {
      throw new Error("Almacén: " + (cuerpo.error || "HTTP " + respuesta.status));
    }
    return cuerpo.result;
  }
  throw new Error(explicarFalloDeRed(ultimoFallo, url));
}

/** Prueba rápida de conexión, para los diagnósticos de los paneles. */
export async function probarAlmacen() {
  if (!almacenDisponible()) return { ok: false, error: "Faltan KV_REST_API_URL y KV_REST_API_TOKEN." };
  const { url } = credenciales();
  let host = "";
  try { host = new URL(url).host; } catch { /* nada */ }
  const inicio = Date.now();
  try {
    const r = await comando(["PING"]);
    return { ok: r === "PONG", host, ms: Date.now() - inicio };
  } catch (error) {
    return { ok: false, host, error: error.message };
  }
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
