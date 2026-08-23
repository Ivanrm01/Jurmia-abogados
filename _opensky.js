/**
 * Comprobación del retraso con fuentes abiertas y gratuitas.
 *
 * Fuente principal: OpenSky Network, red académica de receptores ADS-B que
 * publica los movimientos reales de las aeronaves. Devuelve el último contacto
 * con el avión al aterrizar, que sirve como hora real de llegada.
 *
 * Fuente secundaria: adsbdb.com, que resuelve un indicativo de vuelo en su
 * ruta y su compañía. Se usa solo para corroborar que el vuelo localizado es
 * efectivamente el del expediente.
 *
 * ADVERTENCIA JURÍDICA IMPORTANTE
 * El Tribunal de Justicia declaró en la sentencia de 4 de septiembre de 2014,
 * Germanwings, C-452/13, que la hora de llegada relevante es aquella en que se
 * abre al menos una de las puertas del avión. El último contacto ADS-B se
 * produce antes, al terminar el rodaje. El retraso calculado aquí es por tanto
 * un suelo conservador: el real siempre es igual o mayor. Sirve para triar el
 * expediente y para preparar el interrogatorio, no como prueba en sala, donde
 * hay que acudir al certificado de la aerolínea, a los paneles del aeropuerto
 * o al requerimiento judicial de los registros.
 *
 * Variables de entorno opcionales (sin ellas funciona en modo anónimo, con
 * cupo reducido y menos histórico):
 *   OPENSKY_CLIENT_ID
 *   OPENSKY_CLIENT_SECRET
 */

import "../assets/js/aeropuertos.js";

const A = globalThis.Aeropuertos;

/**
 * Prefijos ICAO de las compañías que más operan desde España.
 * El indicativo radio no siempre coincide con el código comercial, así que
 * esta tabla evita falsos negativos. Amplíela según los expedientes reales.
 */
const COMPANIAS = {
  IB: "IBE", I2: "IBS", YW: "ANE", NT: "IBB", VY: "VLG", UX: "AEA", V7: "VOE",
  FR: "RYR", RK: "RUK", U2: "EZY", EJU: "EZS", W6: "WZZ", W9: "WMT", HV: "TRA",
  TO: "TVF", DE: "CFG", X3: "TUI", EW: "EWG", LH: "DLH", AF: "AFR", KL: "KLM",
  BA: "BAW", AZ: "ITY", TP: "TAP", LX: "SWR", SN: "BEL", OS: "AUA", SK: "SAS",
  AY: "FIN", EI: "EIN", LO: "LOT", OK: "CSA", RO: "ROT", A3: "AEE", OA: "OAL",
  FB: "LZB", JU: "ASL", TK: "THY", PC: "PGT", AT: "RAM", TU: "TAR", MS: "MSR",
  ET: "ETH", KQ: "KQA", SA: "SAA", EK: "UAE", QR: "QTR", EY: "ETD", SV: "SVA",
  AA: "AAL", DL: "DAL", UA: "UAL", B6: "JBU", AS: "ASA", WN: "SWA", AC: "ACA",
  AM: "AMX", CM: "CMP", AV: "AVA", LA: "LAN", JJ: "TAM", AR: "ARG", AD: "AZU",
  G3: "GLO", CU: "CUB", SU: "AFL", AI: "AIC", SQ: "SIA", CX: "CPA", JL: "JAL",
  NH: "ANA", KE: "KAL", OZ: "AAR", CA: "CCA", MU: "CES", CZ: "CSN", QF: "QFA",
  NZ: "ANZ", TG: "THA", MH: "MAS", GA: "GIA", PR: "PAL", VN: "HVN", BR: "EVA",
  CI: "CAL", D8: "IBK", DY: "NAX", SY: "NSZ", BT: "BTI", FI: "ICE", LG: "LGL",
  JP: "ADR", OU: "CTN", YM: "MGX", ZB: "MMZ", NI: "PGA", S4: "RZO", "6H": "ISR"
};

const ahora = () => Math.floor(Date.now() / 1000);

/* ------------------------------------------------------------------ */
/* Husos horarios                                                      */
/* ------------------------------------------------------------------ */

/**
 * Convierte una hora local de un aeropuerto a milisegundos UTC.
 * Se calcula el desfase real de ese día, así que respeta el horario de verano.
 *
 * @param {string} fecha  "2026-07-14"
 * @param {string} hora   "18:35"
 * @param {string} huso   "Europe/Madrid"
 */
export function localAUtc(fecha, hora, huso) {
  if (!fecha || !hora) return null;
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  if ([a, m, d, h, min].some((n) => Number.isNaN(n))) return null;

  // Primera aproximación tratando la hora como si fuera UTC y corrigiendo
  // después con el desfase que el huso tenía en ese instante.
  let ms = Date.UTC(a, m - 1, d, h, min);
  for (let i = 0; i < 3; i++) {
    const desfase = desfaseHuso(ms, huso);
    const nuevo = Date.UTC(a, m - 1, d, h, min) - desfase;
    if (nuevo === ms) break;
    ms = nuevo;
  }
  return ms;
}

/** Desfase del huso respecto a UTC, en milisegundos, en un instante dado. */
function desfaseHuso(ms, huso) {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: huso || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? 0 : p.hour), +p.minute, +p.second);
    return comoUtc - ms;
  } catch {
    return 0;
  }
}

/** Hora local legible de un instante en el huso indicado. */
export function horaLocal(ms, huso) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: huso || "UTC", dateStyle: "short", timeStyle: "short"
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  }
}

/* ------------------------------------------------------------------ */
/* OpenSky                                                             */
/* ------------------------------------------------------------------ */

let credencialCache = { token: null, caduca: 0 };

async function tokenOpenSky() {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secreto = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secreto) return null;
  if (credencialCache.token && credencialCache.caduca > Date.now() + 30000) return credencialCache.token;

  const cuerpo = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secreto
  });

  // Si el servidor de autenticación no responde se sigue en modo anónimo en vez
  // de romper la consulta: el fallo se explica después con el resto del error.
  try {
    const r = await fetch(
      "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo,
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    if (!d || !d.access_token) return null;
    credencialCache = { token: d.access_token, caduca: Date.now() + (d.expires_in || 1800) * 1000 };
    return credencialCache.token;
  } catch (e) {
    console.error("OpenSky: no se pudo obtener el token,", e.message);
    return null;
  }
}

/** Traduce los fallos de red de Node en algo que se pueda leer. */
function explicarFalloRed(e) {
  const causa = (e && e.cause && (e.cause.code || e.cause.message)) || "";
  const mapa = {
    ENOTFOUND: "no se pudo resolver el dominio de OpenSky",
    ECONNREFUSED: "OpenSky rechazó la conexión",
    ECONNRESET: "OpenSky cortó la conexión",
    UND_ERR_CONNECT_TIMEOUT: "OpenSky no respondió a tiempo",
    ETIMEDOUT: "OpenSky no respondió a tiempo",
    CERT_HAS_EXPIRED: "el certificado de OpenSky no es válido"
  };
  if (e && e.name === "TimeoutError") return "OpenSky no respondió en 9 segundos";
  const base = mapa[causa] || (causa ? "fallo de red (" + causa + ")" : "no se pudo establecer la conexión con OpenSky");
  return base +
    ". OpenSky bloquea el tráfico procedente de AWS y otros grandes proveedores de nube, y Vercel " +
    "se aloja en AWS, así que es probable que las consultas nunca lleguen a salir. Use AeroDataBox " +
    "configurando AERODATABOX_KEY";
}

/**
 * Consulta a OpenSky con tiempo máximo y un reintento, porque la red académica
 * se cae con cierta frecuencia y un fallo puntual no debe dar el caso por perdido.
 */
async function consultarOpenSky(ruta, parametros) {
  const url = "https://opensky-network.org/api/flights/" + ruta + "?" + new URLSearchParams(parametros);
  const token = await tokenOpenSky();

  let ultimoFallo = null;
  for (let intento = 0; intento < 2; intento++) {
    try {
      const r = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "jurmia-reclamaciones/1.0",
          ...(token ? { Authorization: "Bearer " + token } : {})
        },
        signal: AbortSignal.timeout(9000)
      });

      if (r.status === 404) return [];
      if (r.status === 401 || r.status === 403) {
        throw new Error(
          "OpenSky exige identificarse para consultar el histórico. Añada OPENSKY_CLIENT_ID y " +
          "OPENSKY_CLIENT_SECRET en las variables de entorno de Vercel y vuelva a desplegar."
        );
      }
      if (r.status === 429) {
        throw new Error(
          "OpenSky ha agotado el cupo de consultas" +
          (token ? "." : " del modo anónimo. Con credenciales propias el cupo es mucho mayor.")
        );
      }
      if (!r.ok) throw new Error("OpenSky respondió con el código " + r.status + ".");

      const texto = await r.text();
      if (!texto.trim()) return [];
      let d;
      try {
        d = JSON.parse(texto);
      } catch {
        throw new Error("OpenSky devolvió una respuesta que no es JSON, probablemente una página de error.");
      }
      return Array.isArray(d) ? d : [];
    } catch (e) {
      // Los errores de negocio no se reintentan; los de red, una vez.
      if (e && e.message && e.message.startsWith("OpenSky ")) throw e;
      ultimoFallo = e;
    }
  }
  throw new Error(explicarFalloRed(ultimoFallo) + ".");
}

/**
 * Separa el designador de compañía del número de vuelo.
 *
 * El designador IATA tiene dos caracteres y puede llevar dígito: IB, VY, FR,
 * U2, W6, 6H. Algunos operadores se identifican con las tres letras del código
 * ICAO. Hay que probar primero las dos posiciones, porque de lo contrario
 * «FR645» se parte como «FR6» más «45», que era justo el fallo.
 */
export function analizarVuelo(bruto) {
  const s = String(bruto || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return { prefijo: "", numero: "" };

  // Dos caracteres: letra+letra, letra+dígito o dígito+letra.
  let m = s.match(/^([A-Z]{2}|[A-Z]\d|\d[A-Z])(\d{1,4})[A-Z]?$/);
  // Tres letras: código ICAO usado directamente.
  if (!m) m = s.match(/^([A-Z]{3})(\d{1,4})[A-Z]?$/);
  if (m) return { prefijo: m[1], numero: String(parseInt(m[2], 10)) };

  // Sin designador reconocible: se conserva el bloque final de dígitos.
  const soloNumero = s.match(/(\d{1,4})[A-Z]?$/);
  return { prefijo: "", numero: soloNumero ? String(parseInt(soloNumero[1], 10)) : "" };
}

/** Dígitos del indicativo que aparece en el registro ADS-B, p. ej. RYR645. */
function digitosIndicativo(indicativo) {
  const m = String(indicativo || "").toUpperCase().match(/(\d{1,4})[A-Z]?$/);
  return m ? String(parseInt(m[1], 10)) : "";
}

/* ------------------------------------------------------------------ */
/* adsbdb: corroboración del indicativo                                */
/* ------------------------------------------------------------------ */

async function rutaAdsbdb(indicativo) {
  try {
    const r = await fetch("https://api.adsbdb.com/v0/callsign/" + encodeURIComponent(indicativo), {
      headers: { Accept: "application/json" }
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    const v = d && d.response && d.response.flightroute;
    if (!v) return null;
    return {
      compania: v.airline ? v.airline.name : "",
      origen: v.origin ? v.origin.iata_code : "",
      destino: v.destination ? v.destination.iata_code : ""
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Comprobación completa                                               */
/* ------------------------------------------------------------------ */

/**
 * Busca el vuelo entre las llegadas reales al aeropuerto de destino y calcula
 * el retraso frente a la hora programada.
 *
 * @param {object} p
 *   vuelo                 número comercial, p. ej. "IB3401"
 *   fecha                 "2026-07-14" (fecha de salida)
 *   origen, destino       códigos IATA
 *   horaLlegadaPrevista   "18:35", hora local del aeropuerto de destino (opcional)
 */
export async function comprobarVuelo(p) {
  const destino = A.porIata[String(p.destino || "").toUpperCase()];
  const origen = A.porIata[String(p.origen || "").toUpperCase()];
  const avisos = [];

  if (!destino || !destino.icao) {
    return { encontrado: false, error: "No se conoce el código ICAO del aeropuerto de destino.", avisos };
  }
  if (!p.fecha) {
    return { encontrado: false, error: "Hace falta la fecha del vuelo.", avisos };
  }

  const { prefijo, numero: num } = analizarVuelo(p.vuelo);
  if (!num) {
    return { encontrado: false, error: "Hace falta el número de vuelo.", avisos };
  }
  const icaoCompania = COMPANIAS[prefijo] || "";
  if (!icaoCompania && prefijo) {
    avisos.push(
      "El designador " + prefijo + " no está en la tabla de compañías, así que no se puede " +
      "acotar por indicativo. Añádalo en api/_opensky.js si va a repetirse."
    );
  }

  // Ventana de búsqueda: el día del vuelo y el siguiente, para cubrir llegadas
  // de madrugada y retrasos largos.
  const inicioDia = Date.parse(p.fecha + "T00:00:00Z") / 1000;
  if (Number.isNaN(inicioDia)) {
    return { encontrado: false, error: "Fecha no válida.", avisos };
  }
  const desde = Math.floor(inicioDia - 6 * 3600);
  const hasta = Math.min(Math.floor(inicioDia + 42 * 3600), ahora());
  if (hasta <= desde) {
    return { encontrado: false, error: "La fecha indicada es futura.", avisos };
  }

  let llegadas;
  try {
    llegadas = await consultarOpenSky("arrival", { airport: destino.icao, begin: desde, end: hasta });
  } catch (e) {
    return {
      encontrado: false,
      error: e.message,
      credenciales: Boolean(process.env.OPENSKY_CLIENT_ID),
      avisos
    };
  }

  const ind = (f) => String(f.callsign || "").trim().toUpperCase();
  const salioDelOrigen = (f) =>
    origen && origen.icao && f.estDepartureAirport &&
    String(f.estDepartureAirport).toUpperCase() === origen.icao;

  /*
   * Búsqueda en cascada, de más a menos fiable. Hace falta porque no todas las
   * compañías usan el número comercial como indicativo radio: Ryanair y easyJet,
   * por ejemplo, vuelan con indicativos alfanuméricos que no guardan relación
   * con el número del billete. En esos casos solo queda identificar el avión por
   * la ruta y la compañía.
   */
  const estrategias = [
    {
      metodo: "indicativo y compañía",
      fiabilidad: "alta",
      filtro: (f) => icaoCompania && ind(f).startsWith(icaoCompania) && digitosIndicativo(ind(f)) === num
    },
    {
      metodo: "número de vuelo",
      fiabilidad: "media",
      filtro: (f) => !icaoCompania && ind(f) && digitosIndicativo(ind(f)) === num
    },
    {
      metodo: "ruta y compañía",
      fiabilidad: "media",
      filtro: (f) => icaoCompania && ind(f).startsWith(icaoCompania) && salioDelOrigen(f)
    },
    {
      metodo: "solo ruta",
      fiabilidad: "baja",
      filtro: (f) => salioDelOrigen(f)
    }
  ];

  let candidatos = [], metodo = "", fiabilidad = "";
  for (const e of estrategias) {
    const encontrados = llegadas.filter(e.filtro);
    if (encontrados.length) {
      candidatos = encontrados;
      metodo = e.metodo;
      fiabilidad = e.fiabilidad;
      break;
    }
  }

  if (candidatos.length === 0) {
    avisos.push(
      "Se han revisado " + llegadas.length + " llegadas a " + destino.iata + " ese día sin encontrar " +
      "el vuelo. Suele deberse a falta de cobertura ADS-B en ese aeropuerto, a que el histórico de " +
      "OpenSky no alcance esa fecha o a que la compañía opere con un indicativo que no coincide ni " +
      "con el número ni con la ruta registrada. Introduzca la hora real de llegada a mano."
    );
    return { encontrado: false, consultadas: llegadas.length, credenciales: Boolean(process.env.OPENSKY_CLIENT_ID), avisos };
  }

  if (fiabilidad !== "alta") {
    avisos.push(
      "El vuelo se ha identificado por " + metodo + ", no por su indicativo exacto. Contraste la hora " +
      "con la documentación del cliente antes de darla por buena."
    );
  }

  // Si hay más de uno, se toma el más cercano a la hora prevista de llegada.
  const previstaMs = p.horaLlegadaPrevista
    ? localAUtc(p.fecha, p.horaLlegadaPrevista, destino.huso)
    : null;

  candidatos.sort((a, b) => {
    if (!previstaMs) return a.lastSeen - b.lastSeen;
    return Math.abs(a.lastSeen * 1000 - previstaMs) - Math.abs(b.lastSeen * 1000 - previstaMs);
  });
  const v = candidatos[0];

  const aterrizajeMs = v.lastSeen * 1000;
  const despegueMs = v.firstSeen * 1000;

  let retrasoMin = null;
  if (previstaMs) {
    // Si la llegada real cae más de 12 h antes que la prevista, es que la
    // llegada corresponde al día siguiente: se ajusta el día previsto.
    let ref = previstaMs;
    if (aterrizajeMs - ref < -12 * 3600000) ref -= 24 * 3600000;
    if (aterrizajeMs - ref > 20 * 3600000) ref += 24 * 3600000;
    retrasoMin = Math.round((aterrizajeMs - ref) / 60000);
  } else {
    avisos.push("Sin hora programada de llegada no se puede calcular el retraso: solo se muestra la hora real.");
  }

  const origenDetectado = v.estDepartureAirport ? A.porIcao[v.estDepartureAirport] : null;
  if (origen && origenDetectado && origenDetectado.iata !== origen.iata) {
    avisos.push(
      "El vuelo localizado despegó de " + origenDetectado.iata + " y el expediente indica " +
      origen.iata + ". Verifique que se trata del mismo vuelo."
    );
  }

  const corroboracion = await rutaAdsbdb(String(v.callsign || "").trim());

  avisos.push(
    "La hora que consta es la del último contacto ADS-B, que se produce al terminar el rodaje. " +
    "Conforme a la STJUE de 4 de septiembre de 2014, Germanwings, C-452/13, el retraso se mide " +
    "hasta la apertura de puertas, de modo que el real será igual o mayor que el calculado."
  );

  return {
    encontrado: true,
    fuente: "OpenSky Network (ADS-B)",
    metodo,
    fiabilidad,
    indicativo: String(v.callsign || "").trim(),
    icao24: v.icao24,
    despegueUtc: new Date(despegueMs).toISOString(),
    aterrizajeUtc: new Date(aterrizajeMs).toISOString(),
    aterrizajeLocal: horaLocal(aterrizajeMs, destino.huso),
    despegueLocal: origen ? horaLocal(despegueMs, origen.huso) : "",
    llegadaPrevistaLocal: previstaMs ? horaLocal(previstaMs, destino.huso) : "",
    retrasoMin,
    duracionVueloMin: Math.round((aterrizajeMs - despegueMs) / 60000),
    origenDetectado: origenDetectado ? origenDetectado.iata : v.estDepartureAirport || "",
    corroboracion,
    candidatos: candidatos.length,
    consultadas: llegadas.length,
    comprobadoEl: new Date().toISOString(),
    avisos
  };
}
