/**
 * API del panel de reclamaciones aéreas.
 *
 * Acciones: listar, abrir, actualizar, comprobar, documento, borrar.
 * Todas exigen sesión válida del panel (la misma que el blog).
 */

/*
 * Las fuentes de comprobación de vuelos se cargan de forma dinámica y aislada.
 * Son accesorias: si una falta o falla al cargarse, el panel debe seguir
 * funcionando y limitarse a decir que esa fuente no está disponible, en lugar
 * de tumbar la función entera y dejar al despacho sin expedientes.
 */
async function cargarFuente(ruta) {
  try {
    return await import(ruta);
  } catch (e) {
    console.error("Fuente de datos no disponible (" + ruta + "):", e && e.message);
    return null;
  }
}

/** Módulo imprescindible: si falla, el error dice exactamente cuál es. */
async function cargarModulo(ruta) {
  try {
    return await import(ruta);
  } catch (e) {
    console.error("Módulo imprescindible no disponible (" + ruta + "):", e && e.message);
    throw new Error(
      "No se pudo cargar " + ruta + " en el servidor. Compruebe que el archivo está en el " +
      "repositorio y vuelva a desplegar. Detalle: " + (e && e.message)
    );
  }
}
const limpio = (t, max = 200) => String(t == null ? "" : t).trim().slice(0, max);

/** Datos del despacho: se leen del entorno para no repetirlos en cada expediente. */
function despachoPorDefecto() {
  return {
    nombre: process.env.DESPACHO_NOMBRE || "JURMIA Abogados",
    letrado: process.env.DESPACHO_LETRADO || "",
    colegio: process.env.DESPACHO_COLEGIO || "",
    colegiado: process.env.DESPACHO_COLEGIADO || "",
    domicilio: process.env.DESPACHO_DOMICILIO || "",
    ciudad: process.env.DESPACHO_CIUDAD || "",
    email: process.env.DESPACHO_EMAIL || process.env.CORREO_DESTINO || "",
    partido: process.env.DESPACHO_PARTIDO || "",
    audiencia: process.env.DESPACHO_AUDIENCIA || "",
    fuero: "lugar de salida del vuelo",
    honorarios: Number(process.env.DESPACHO_HONORARIOS || 25)
  };
}

export default async function handler(req, res) {
  // Envoltura general: pase lo que pase, la respuesta será JSON legible y no un
  // fallo de invocación de Vercel, que en el navegador no dice nada útil.
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
    const accion = limpio(d.accion, 30);

    const sesionMod = await cargarModulo("./_sesion.js");
    const control = sesionMod.exigirSesion(req);
    if (control.error) return res.status(control.estado).json({ error: control.error });

    /* ---------------- diagnóstico ---------------- */

    if (accion === "diagnostico") {
      const probar = async (ruta) => {
        try { await import(ruta); return "cargado"; }
        catch (e) { return "ERROR: " + (e && e.message ? String(e.message).slice(0, 200) : "desconocido"); }
      };
      return res.status(200).json({
        nodo: process.version,
        modulos: {
          "_almacen.js": await probar("./_almacen.js"),
          "_documentos.js": await probar("./_documentos.js"),
          "_opensky.js": await probar("./_opensky.js"),
          "_aerodatabox.js": await probar("./_aerodatabox.js"),
          "aeropuertos.js": await probar("../assets/js/aeropuertos.js"),
          "vuelos-motor.js": await probar("../assets/js/vuelos-motor.js")
        },
        entorno: {
          almacen: Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
          aerodatabox: Boolean(process.env.AERODATABOX_KEY),
          opensky: Boolean(process.env.OPENSKY_CLIENT_ID),
          despacho: Boolean(process.env.DESPACHO_LETRADO)
        }
      });
    }

    const almacenMod = await cargarModulo("./_almacen.js");
    if (!almacenMod.almacenDisponible()) {
      return res.status(500).json({
        error: "El almacén de expedientes no está configurado. Añada KV_REST_API_URL y KV_REST_API_TOKEN en Vercel."
      });
    }

    if (accion === "listar") {
      return res.status(200).json({ expedientes: await almacenMod.listar(200) });
    }

    await cargarModulo("../assets/js/aeropuertos.js");
    await cargarModulo("../assets/js/vuelos-motor.js");
    const M = globalThis.MotorVuelos;
    if (!M) throw new Error("El motor de reglas no llegó a inicializarse.");

    const recalcular = (e) => {
      const calculo = M.evaluar({
        origen: e.vuelo.origen,
        destino: e.vuelo.destino,
        incidencia: e.caso.incidencia,
        minutos: e.caso.minutos,
        avisoDias: e.caso.avisoDias,
        reubicacionAjustada: e.caso.reubicacionAjustada,
        causa: e.caso.causa,
        companiaUE: e.vuelo.companiaUE !== false,
        pasajeros: e.caso.pasajeros,
        gastos: e.caso.gastos
      });
      if (calculo.ok) e.calculo = calculo;
      return e;
    };
    /* ---------------- listado ---------------- */
    if (accion === "listar") {
      return res.status(200).json({ expedientes: await listar(200) });
    }

    /* ---------------- abrir ---------------- */
    if (accion === "abrir") {
      const e = await almacenMod.leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {});
      return res.status(200).json({
        expediente: e,
        prescripcion: M.prescripcion(e.vuelo && e.vuelo.fecha),
        documentos: [
          { id: "reclamacion", titulo: "Reclamación extrajudicial" },
          { id: "aesa", titulo: "Reclamación ante AESA" },
          { id: "encargo", titulo: "Hoja de encargo" },
          { id: "demanda", titulo: "Demanda de juicio verbal" },
          { id: "nota", titulo: "Nota interna de viabilidad" }
        ]
      });
    }

    /* ---------------- actualizar ---------------- */
    if (accion === "actualizar") {
      const e = await almacenMod.leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      const c = d.cambios || {};

      if (c.estado) e.estado = limpio(c.estado, 30);
      if (typeof c.notas === "string") e.notas = limpio(c.notas, 8000);
      if (c.fechaReclamacion !== undefined) e.fechaReclamacion = limpio(c.fechaReclamacion, 10);
      if (c.respuestaAerolinea !== undefined) e.respuestaAerolinea = Boolean(c.respuestaAerolinea);

      ["nombre", "telefono", "email", "dni", "direccion", "iban", "observaciones"].forEach((k) => {
        if (c.cliente && c.cliente[k] !== undefined) e.cliente[k] = limpio(c.cliente[k], 300);
      });

      ["numero", "aerolinea", "fecha", "origen", "destino", "localizador",
       "horaLlegadaPrevista", "horaLlegadaReal"].forEach((k) => {
        if (c.vuelo && c.vuelo[k] !== undefined) e.vuelo[k] = limpio(c.vuelo[k], 60);
      });
      if (c.vuelo && c.vuelo.companiaUE !== undefined) e.vuelo.companiaUE = Boolean(c.vuelo.companiaUE);
      if (e.vuelo.origen) e.vuelo.origen = e.vuelo.origen.toUpperCase();
      if (e.vuelo.destino) e.vuelo.destino = e.vuelo.destino.toUpperCase();

      if (c.caso) {
        if (c.caso.incidencia) e.caso.incidencia = limpio(c.caso.incidencia, 20);
        if (c.caso.causa) e.caso.causa = limpio(c.caso.causa, 20);
        if (c.caso.minutos !== undefined) e.caso.minutos = Math.max(0, parseInt(c.caso.minutos, 10) || 0);
        if (c.caso.avisoDias !== undefined) e.caso.avisoDias = Math.max(0, parseInt(c.caso.avisoDias, 10) || 0);
        if (c.caso.pasajeros !== undefined) e.caso.pasajeros = Math.max(1, parseInt(c.caso.pasajeros, 10) || 1);
        if (c.caso.gastos !== undefined) e.caso.gastos = Math.max(0, Number(c.caso.gastos) || 0);
        if (c.caso.reubicacionAjustada !== undefined) e.caso.reubicacionAjustada = Boolean(c.caso.reubicacionAjustada);
      }

      if (c.despacho) {
        e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {}, c.despacho);
        e.despacho.honorarios = Math.min(60, Math.max(0, Number(e.despacho.honorarios) || 25));
      }

      recalcular(e);
      e.historial = (e.historial || []).concat([{
        fecha: new Date().toISOString(),
        quien: control.sesion.nombre || control.sesion.correo,
        que: "Actualización de datos"
      }]).slice(-40);

      await almacenMod.guardar(e);
      return res.status(200).json({ expediente: e, prescripcion: M.prescripcion(e.vuelo.fecha) });
    }

    /* ---------------- comprobación del retraso ---------------- */
    if (accion === "comprobar") {
      const e = await almacenMod.leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });

      const consulta = {
        vuelo: e.vuelo.numero,
        fecha: e.vuelo.fecha,
        origen: e.vuelo.origen,
        destino: e.vuelo.destino,
        horaLlegadaPrevista: e.vuelo.horaLlegadaPrevista
      };

      /*
       * Primero AeroDataBox, que da hora programada y hora real de puerta con
       * los datos del propio aeropuerto. Si no está configurada o no encuentra
       * el vuelo, se intenta con la red ADS-B de OpenSky.
       */
      const aeroDataBox = await cargarFuente("./_aerodatabox.js");
      const openSky = await cargarFuente("./_opensky.js");

      let resultado = aeroDataBox
        ? await aeroDataBox.comprobarConAeroDataBox(consulta)
        : { encontrado: false, omitida: true, avisos: ["El módulo de AeroDataBox no se pudo cargar en el servidor."] };

      const intentos = [];
      if (!resultado.omitida) {
        intentos.push({
          fuente: "AeroDataBox",
          resultado: resultado.encontrado ? "vuelo localizado" : (resultado.error || "sin resultado")
        });
      }

      if (!resultado.encontrado) {
        const respaldo = openSky
          ? await openSky.comprobarVuelo(consulta)
          : { encontrado: false, error: "El módulo de OpenSky no se pudo cargar en el servidor.", avisos: [] };
        intentos.push({
          fuente: "OpenSky",
          resultado: respaldo.encontrado ? "vuelo localizado" : (respaldo.error || "sin resultado")
        });
        if (respaldo.encontrado) {
          respaldo.avisos = (resultado.avisos || []).concat(respaldo.avisos || []);
          resultado = respaldo;
        } else {
          // Se conserva el diagnóstico más informativo de los dos.
          resultado = {
            encontrado: false,
            error: resultado.error || respaldo.error || "",
            avisos: (resultado.avisos || []).concat(respaldo.avisos || []),
            credenciales: respaldo.credenciales,
            aeroDataBox: Boolean(process.env.AERODATABOX_KEY)
          };
        }
      }
      resultado.intentos = intentos;
      resultado.aeroDataBox = Boolean(process.env.AERODATABOX_KEY);

      // Si la fuente trae la hora programada, se guarda para no volver a pedirla.
      if (resultado.encontrado && resultado.horaProgramadaTexto && !e.vuelo.horaLlegadaPrevista) {
        e.vuelo.horaLlegadaPrevista = resultado.horaProgramadaTexto;
      }
      if (resultado.encontrado && resultado.horaRealTexto) {
        e.vuelo.horaLlegadaReal = resultado.horaRealTexto;
      }

      e.verificacion = resultado;
      if (resultado.encontrado && resultado.retrasoMin != null && d.aplicar) {
        e.caso.minutos = Math.max(0, resultado.retrasoMin);
        recalcular(e);
      }
      e.historial = (e.historial || []).concat([{
        fecha: new Date().toISOString(),
        quien: control.sesion.nombre || control.sesion.correo,
        que: resultado.encontrado
          ? "Comprobación en " + resultado.fuente + ": llegada " + (resultado.aterrizajeLocal || resultado.aterrizajeUtc)
          : "Comprobación sin resultado"
      }]).slice(-40);

      await almacenMod.guardar(e);
      return res.status(200).json({ verificacion: resultado, expediente: e });
    }

    /* ---------------- documentos ---------------- */
    if (accion === "documento") {
      const e = await almacenMod.leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      const docsMod = await cargarModulo("./_documentos.js");
      e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {});
      return res.status(200).json(docsMod.generarDocumento(e, limpio(d.tipo, 20)));
    }

    /* ---------------- borrado (derecho de supresión) ---------------- */
    if (accion === "borrar") {
      // Admite un id suelto o una lista, para el borrado en lote del listado.
      const ids = (Array.isArray(d.ids) ? d.ids : [d.id])
        .map((x) => limpio(x, 40))
        .filter(Boolean)
        .slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: "No se ha indicado ningún expediente." });

      let borrados = 0;
      const noEncontrados = [];
      for (const id of ids) {
        const e = await almacenMod.leer(id);
        if (!e) { noEncontrados.push(id); continue; }
        await almacenMod.borrar(id);
        borrados++;
        console.log("Expediente borrado", id, "por", control.sesion.correo);
      }
      if (!borrados) return res.status(404).json({ error: "No se ha encontrado ningún expediente de los indicados." });
      return res.status(200).json({ ok: true, borrados, noEncontrados });
    }

    return res.status(400).json({ error: "Acción no reconocida." });
  } catch (error) {
    console.error("Panel de vuelos:", error);
    return res.status(500).json({ error: error.message || "Error inesperado." });
  }
}
