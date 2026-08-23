/**
 * Comprobación del retraso con AeroDataBox.
 *
 * Es la fuente principal, y por dos razones. La primera es práctica: OpenSky
 * bloquea el tráfico procedente de los grandes proveedores de nube, y Vercel
 * corre sobre AWS, de modo que las consultas ni siquiera llegan a establecerse.
 * La segunda es jurídica: AeroDataBox no trabaja con radar sino con los datos
 * FIDS que publica el propio aeropuerto, es decir, con la hora programada y la
 * hora real de llegada a puerta. Eso está mucho más cerca del criterio de
 * apertura de puertas que fijó la STJUE de 4 de septiembre de 2014,
 * Germanwings, C-452/13, que el último contacto ADS-B, que se produce al
 * terminar el rodaje.
 *
 * Variables de entorno:
 *   AERODATABOX_KEY    clave de RapidAPI o de API.Market (plan gratuito)
 *   AERODATABOX_HOST   opcional, por defecto aerodatabox.p.rapidapi.com
 */

import "../assets/js/aeropuertos.js";

const A = globalThis.Aeropuertos;

export function aeroDataBoxConfigurado() {
  return Boolean(process.env.AERODATABOX_KEY);
}

/** Las horas llegan como "2026-07-14 18:35+02:00" o "2026-07-14 16:35Z". */
function aFecha(valor) {
  if (!valor) return null;
  const t = String(valor).trim().replace(" ", "T");
  const ms = Date.parse(/[Z+]|-\d{2}:\d{2}$/.test(t.slice(10)) ? t : t + "Z");
  return Number.isNaN(ms) ? null : ms;
}

/** Texto legible de una hora local ya facilitada por la API. */
function textoLocal(bloque) {
  if (!bloque) return "";
  const bruto = bloque.local || bloque.utc || "";
  return String(bruto).replace("T", " ").replace(/(\+\d{2}:\d{2}|Z)$/, "").trim();
}

/**
 * La hora real de llegada, por orden de preferencia:
 * la revisada, que es la de llegada a puerta; después la de pista; y por
 * último la predicha, que se marca como estimación.
 */
function horaLlegadaReal(llegada) {
  if (!llegada) return null;
  const opciones = [
    { bloque: llegada.revisedTime, clase: "hora real de llegada a puerta" },
    { bloque: llegada.runwayTime, clase: "hora de toma de pista" },
    { bloque: llegada.actualTime, clase: "hora real de llegada" },
    { bloque: llegada.predictedTime, clase: "hora estimada" }
  ];
  for (const o of opciones) {
    const ms = aFecha(o.bloque && (o.bloque.utc || o.bloque.local));
    if (ms) return { ms, clase: o.clase, bloque: o.bloque };
  }
  return null;
}

/**
 * @param {object} p vuelo, fecha (AAAA-MM-DD), origen, destino (IATA)
 */
export async function comprobarConAeroDataBox(p) {
  const avisos = [];
  const clave = process.env.AERODATABOX_KEY;
  if (!clave) return { encontrado: false, omitida: true, avisos };

  const host = process.env.AERODATABOX_HOST || "aerodatabox.p.rapidapi.com";
  const numero = String(p.vuelo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!numero) return { encontrado: false, error: "Hace falta el número de vuelo.", avisos };
  if (!p.fecha) return { encontrado: false, error: "Hace falta la fecha del vuelo.", avisos };

  const url = "https://" + host + "/flights/number/" + encodeURIComponent(numero) + "/" +
    encodeURIComponent(p.fecha) + "?withAircraftImage=false&withLocation=false";

  let datos;
  try {
    const r = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-RapidAPI-Key": clave,
        "X-RapidAPI-Host": host,
        "x-magicapi-key": clave        // API.Market usa esta cabecera
      },
      signal: AbortSignal.timeout(9000)
    });

    if (r.status === 204 || r.status === 404) {
      return {
        encontrado: false,
        avisos: avisos.concat([
          "AeroDataBox no tiene registrado el vuelo " + numero + " el " + p.fecha +
          ". Compruebe el número y la fecha de salida, que en vuelos de madrugada puede ser la del día anterior."
        ])
      };
    }
    if (r.status === 401 || r.status === 403) {
      return { encontrado: false, error: "AeroDataBox rechaza la clave. Revise AERODATABOX_KEY y que la suscripción siga activa.", avisos };
    }
    if (r.status === 429) {
      return { encontrado: false, error: "Se ha agotado la cuota mensual de AeroDataBox. Se renueva con el ciclo de facturación.", avisos };
    }
    if (!r.ok) return { encontrado: false, error: "AeroDataBox respondió con el código " + r.status + ".", avisos };

    datos = await r.json();
  } catch (e) {
    const causa = (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.name) || "";
    return {
      encontrado: false,
      error: "No se pudo contactar con AeroDataBox" + (causa ? " (" + causa + ")" : "") + ".",
      avisos
    };
  }

  const vuelos = Array.isArray(datos) ? datos : datos ? [datos] : [];
  if (!vuelos.length) {
    return {
      encontrado: false,
      avisos: avisos.concat(["AeroDataBox no devolvió ningún vuelo con ese número y esa fecha."])
    };
  }

  // Si hay varios tramos con el mismo número, se elige el que case con la ruta.
  const destinoPedido = String(p.destino || "").toUpperCase();
  const origenPedido = String(p.origen || "").toUpperCase();
  const casaRuta = (v) => {
    const d = v.arrival && v.arrival.airport ? String(v.arrival.airport.iata || "").toUpperCase() : "";
    const o = v.departure && v.departure.airport ? String(v.departure.airport.iata || "").toUpperCase() : "";
    return (!destinoPedido || d === destinoPedido) && (!origenPedido || o === origenPedido);
  };
  const v = vuelos.find(casaRuta) || vuelos[0];
  if (!casaRuta(v)) {
    avisos.push(
      "El vuelo localizado no coincide exactamente con la ruta del expediente. Verifique que se trata del mismo trayecto."
    );
  }

  const llegada = v.arrival || {};
  const prevista = aFecha(llegada.scheduledTime && (llegada.scheduledTime.utc || llegada.scheduledTime.local));
  const real = horaLlegadaReal(llegada);

  if (!prevista) {
    return {
      encontrado: false,
      avisos: avisos.concat(["AeroDataBox no publica la hora programada de llegada de este vuelo."])
    };
  }
  if (!real) {
    const estado = v.status ? " El estado que consta es: " + v.status + "." : "";
    return {
      encontrado: false,
      avisos: avisos.concat([
        "AeroDataBox conoce el vuelo pero no publica su hora real de llegada." + estado +
        " Introduzca la hora a mano con el dato de la aerolínea."
      ])
    };
  }

  if (/estimada/.test(real.clase)) {
    avisos.push("La hora que consta es una estimación, no un dato consolidado. Contrástela antes de reclamar sobre ella.");
  }
  if (/pista/.test(real.clase)) {
    avisos.push(
      "El dato disponible es la toma de pista, anterior a la apertura de puertas. Conforme a la STJUE " +
      "Germanwings, C-452/13, el retraso real será igual o mayor que el calculado."
    );
  }

  const retrasoMin = Math.round((real.ms - prevista) / 60000);
  const salida = v.departure || {};
  const aeropuertoDestino = A.porIata[destinoPedido];

  return {
    encontrado: true,
    fuente: "AeroDataBox (datos del aeropuerto)",
    metodo: "número de vuelo y fecha",
    fiabilidad: "alta",
    indicativo: v.number || numero,
    matricula: v.aircraft ? v.aircraft.reg || "" : "",
    modelo: v.aircraft ? v.aircraft.model || "" : "",
    compania: v.airline ? v.airline.name || "" : "",
    estado: v.status || "",
    claseHora: real.clase,
    llegadaPrevistaLocal: textoLocal(llegada.scheduledTime),
    aterrizajeLocal: textoLocal(real.bloque),
    aterrizajeUtc: new Date(real.ms).toISOString(),
    despegueLocal: textoLocal(salida.revisedTime || salida.runwayTime || salida.scheduledTime),
    salidaPrevistaLocal: textoLocal(salida.scheduledTime),
    origenDetectado: salida.airport ? salida.airport.iata || "" : "",
    destinoDetectado: llegada.airport ? llegada.airport.iata || "" : "",
    puerta: llegada.gate || "",
    terminal: llegada.terminal || "",
    retrasoMin,
    horaProgramadaTexto: textoLocal(llegada.scheduledTime).slice(11, 16),
    horaRealTexto: textoLocal(real.bloque).slice(11, 16),
    husoDestino: aeropuertoDestino ? aeropuertoDestino.huso : "",
    comprobadoEl: new Date().toISOString(),
    avisos
  };
}
