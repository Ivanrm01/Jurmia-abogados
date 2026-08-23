/**
 * API del panel de reclamaciones aéreas.
 *
 * Acciones: diagnostico, listar, abrir, actualizar, comprobar, documento, borrar.
 * Todas exigen sesión válida del panel, la misma que la del blog.
 *
 * Nota sobre los imports: son estáticos a propósito. Vercel analiza el código
 * para decidir qué archivos empaqueta con la función, y un import dinámico cuya
 * ruta viene en una variable no puede analizarlo, de modo que el archivo se
 * queda fuera del despliegue y la función falla al arrancar. Con imports
 * estáticos el rastreo funciona y todo el módulo viaja junto.
 *
 * El manejador va envuelto en un try general para que cualquier fallo se
 * devuelva como JSON legible en lugar de un error de invocación de Vercel.
 */

import "../assets/js/aeropuertos.js";
import "../assets/js/vuelos-motor.js";
import { exigirSesion } from "./_sesion.js";
import { listar, leer, guardar, borrar, almacenDisponible } from "./_almacen.js";
import { generarDocumento, TIPOS } from "./_documentos.js";
import { comprobarVuelo } from "./_opensky.js";
import { comprobarConAeroDataBox } from "./_aerodatabox.js";

const M = globalThis.MotorVuelos;

const limpio = (t, max = 200) => String(t == null ? "" : t).trim().slice(0, max);

/** Datos del despacho, del entorno, para no repetirlos en cada expediente. */
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

/** Recalcula el expediente tras cualquier cambio, para que nada quede desfasado. */
function recalcular(e) {
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
    const accion = limpio(d.accion, 30);

    const control = exigirSesion(req);
    if (control.error) return res.status(control.estado).json({ error: control.error });

    const anotar = (e, que) => {
      e.historial = (e.historial || []).concat([{
        fecha: new Date().toISOString(),
        quien: control.sesion.nombre || control.sesion.correo,
        que
      }]).slice(-40);
    };

    /* ---------------- diagnóstico ---------------- */

    if (accion === "diagnostico") {
      return res.status(200).json({
        nodo: process.version,
        modulos: {
          "_sesion.js": typeof exigirSesion === "function" ? "cargado" : "ERROR",
          "_almacen.js": typeof listar === "function" ? "cargado" : "ERROR",
          "_documentos.js": typeof generarDocumento === "function" ? "cargado" : "ERROR",
          "_opensky.js": typeof comprobarVuelo === "function" ? "cargado" : "ERROR",
          "_aerodatabox.js": typeof comprobarConAeroDataBox === "function" ? "cargado" : "ERROR",
          "aeropuertos.js": globalThis.Aeropuertos ? "cargado" : "ERROR",
          "vuelos-motor.js": M ? "cargado" : "ERROR"
        },
        entorno: {
          almacen: Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
          aerodatabox: Boolean(process.env.AERODATABOX_KEY),
          opensky: Boolean(process.env.OPENSKY_CLIENT_ID),
          despacho: Boolean(process.env.DESPACHO_LETRADO)
        }
      });
    }

    if (!almacenDisponible()) {
      return res.status(500).json({
        error: "El almacén de expedientes no está configurado. Añada KV_REST_API_URL y KV_REST_API_TOKEN en Vercel."
      });
    }

    /* ---------------- listado ---------------- */

    if (accion === "listar") {
      return res.status(200).json({ expedientes: await listar(200) });
    }

    /* ---------------- abrir ---------------- */

    if (accion === "abrir") {
      const e = await leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {});
      return res.status(200).json({
        expediente: e,
        prescripcion: M.prescripcion(e.vuelo && e.vuelo.fecha),
        documentos: Object.keys(TIPOS).map((k) => ({ id: k, titulo: TIPOS[k].titulo }))
      });
    }

    /* ---------------- actualizar ---------------- */

    if (accion === "actualizar") {
      const e = await leer(limpio(d.id, 40));
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
      anotar(e, "Actualización de datos");
      await guardar(e);
      return res.status(200).json({ expediente: e, prescripcion: M.prescripcion(e.vuelo.fecha) });
    }

    /* ---------------- comprobación del retraso ---------------- */

    if (accion === "comprobar") {
      const e = await leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });

      const consulta = {
        vuelo: e.vuelo.numero,
        fecha: e.vuelo.fecha,
        origen: e.vuelo.origen,
        destino: e.vuelo.destino,
        horaLlegadaPrevista: e.vuelo.horaLlegadaPrevista
      };

      /*
       * Primero AeroDataBox, que publica hora programada y hora real de puerta
       * con datos del propio aeropuerto. Si no lo encuentra, se prueba con la
       * red ADS-B de OpenSky. Cada fuente va en su propio try para que el fallo
       * de una no impida intentar la otra.
       */
      const intentos = [];
      let resultado = { encontrado: false, omitida: true, avisos: [] };

      try {
        resultado = await comprobarConAeroDataBox(consulta);
      } catch (fallo) {
        resultado = { encontrado: false, error: "AeroDataBox: " + fallo.message, avisos: [] };
      }
      if (!resultado.omitida) {
        intentos.push({
          fuente: "AeroDataBox",
          resultado: resultado.encontrado ? "vuelo localizado" : (resultado.error || "sin resultado")
        });
      }

      if (!resultado.encontrado) {
        let respaldo;
        try {
          respaldo = await comprobarVuelo(consulta);
        } catch (fallo) {
          respaldo = { encontrado: false, error: "OpenSky: " + fallo.message, avisos: [] };
        }
        intentos.push({
          fuente: "OpenSky",
          resultado: respaldo.encontrado ? "vuelo localizado" : (respaldo.error || "sin resultado")
        });
        if (respaldo.encontrado) {
          respaldo.avisos = (resultado.avisos || []).concat(respaldo.avisos || []);
          resultado = respaldo;
        } else {
          resultado = {
            encontrado: false,
            error: resultado.error || respaldo.error || "",
            avisos: (resultado.avisos || []).concat(respaldo.avisos || []),
            credenciales: respaldo.credenciales
          };
        }
      }

      resultado.intentos = intentos;
      resultado.aeroDataBox = Boolean(process.env.AERODATABOX_KEY);

      // Si la fuente trae las horas, se guardan para no volver a pedirlas.
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
      anotar(e, resultado.encontrado
        ? "Comprobación en " + resultado.fuente + ": llegada " + (resultado.aterrizajeLocal || resultado.aterrizajeUtc)
        : "Comprobación sin resultado");

      await guardar(e);
      return res.status(200).json({ verificacion: resultado, expediente: e });
    }

    /* ---------------- documentos ---------------- */

    if (accion === "documento") {
      const e = await leer(limpio(d.id, 40));
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {});
      return res.status(200).json(generarDocumento(e, limpio(d.tipo, 20)));
    }

    /* ---------------- borrado (derecho de supresión) ---------------- */

    if (accion === "borrar") {
      const ids = (Array.isArray(d.ids) ? d.ids : [d.id])
        .map((x) => limpio(x, 40))
        .filter(Boolean)
        .slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: "No se ha indicado ningún expediente." });

      let borrados = 0;
      const noEncontrados = [];
      for (const id of ids) {
        const e = await leer(id);
        if (!e) { noEncontrados.push(id); continue; }
        await borrar(id);
        borrados++;
        console.log("Expediente borrado", id, "por", control.sesion.correo);
      }
      if (!borrados) return res.status(404).json({ error: "No se ha encontrado ningún expediente de los indicados." });
      return res.status(200).json({ ok: true, borrados, noEncontrados });
    }

    return res.status(400).json({ error: "Acción no reconocida: " + accion });
  } catch (error) {
    console.error("Panel de vuelos:", error);
    return res.status(500).json({ error: (error && error.message) || "Error inesperado en el servidor." });
  }
}
