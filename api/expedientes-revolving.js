/**
 * API del panel de expedientes de tarjetas revolving.
 *
 * Acciones: listar, abrir, actualizar, documento, borrar.
 * Exige la misma sesión que el resto del panel.
 *
 * Los imports son estáticos a propósito: Vercel decide qué archivos empaqueta
 * analizando el código, y una ruta dinámica en variable no puede rastrearla.
 */

import "../assets/js/revolving-motor.js";
import { exigirSesion } from "./_sesion.js";
import { listar, leer, guardar, borrar, almacenDisponible } from "./_almacen.js";
import { generarDocumento, TIPOS } from "./_documentos-revolving.js";

const M = globalThis.MotorRevolving;
const MATERIA = "revolving";

const limpio = (t, max = 200) => String(t == null ? "" : t).trim().slice(0, max);

function despachoPorDefecto() {
  return {
    nombre: process.env.DESPACHO_NOMBRE || "JURMIA Abogados",
    letrado: process.env.DESPACHO_LETRADO || "",
    procurador: process.env.DESPACHO_PROCURADOR || "",
    colegio: process.env.DESPACHO_COLEGIO || "",
    colegiado: process.env.DESPACHO_COLEGIADO || "",
    domicilio: process.env.DESPACHO_DOMICILIO || "",
    ciudad: process.env.DESPACHO_CIUDAD || "",
    email: process.env.DESPACHO_EMAIL || process.env.CORREO_DESTINO || "",
    partido: process.env.DESPACHO_PARTIDO || "",
    audiencia: process.env.DESPACHO_AUDIENCIA || "",
    honorarios: Number(process.env.DESPACHO_HONORARIOS || 25)
  };
}

/** Recalcula el expediente tras cualquier cambio del letrado. */
function recalcular(e) {
  const calculo = M.evaluar({
    anio: e.tarjeta.anio,
    tae: e.tarjeta.tae,
    tipoMedio: e.tarjeta.tipoMedio,
    capitalDispuesto: e.caso.capitalDispuesto,
    totalPagado: e.caso.totalPagado,
    deudaPendiente: e.caso.deudaPendiente,
    anosPagando: e.tarjeta.anosPagando,
    situacion: e.caso.situacion,
    indicios: e.caso.indicios
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

    if (accion === "diagnostico") {
      return res.status(200).json({
        nodo: process.version,
        modulos: {
          "_sesion.js": typeof exigirSesion === "function" ? "cargado" : "ERROR",
          "_almacen.js": typeof listar === "function" ? "cargado" : "ERROR",
          "_documentos-revolving.js": typeof generarDocumento === "function" ? "cargado" : "ERROR",
          "revolving-motor.js": M ? "cargado" : "ERROR"
        },
        entorno: {
          almacen: Boolean(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
          despacho: Boolean(process.env.DESPACHO_LETRADO),
          procurador: Boolean(process.env.DESPACHO_PROCURADOR)
        }
      });
    }

    if (!almacenDisponible()) {
      return res.status(500).json({
        error: "El almacén de expedientes no está configurado. Añada KV_REST_API_URL y KV_REST_API_TOKEN en Vercel."
      });
    }

    if (accion === "listar") {
      return res.status(200).json({ expedientes: await listar(200, MATERIA) });
    }

    if (accion === "abrir") {
      const e = await leer(limpio(d.id, 40), MATERIA);
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {});
      return res.status(200).json({
        expediente: e,
        documentos: Object.keys(TIPOS).map((k) => ({ id: k, titulo: TIPOS[k].titulo }))
      });
    }

    if (accion === "actualizar") {
      const e = await leer(limpio(d.id, 40), MATERIA);
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      const c = d.cambios || {};

      if (c.estado) e.estado = limpio(c.estado, 30);
      if (typeof c.notas === "string") e.notas = limpio(c.notas, 8000);
      if (c.fechaReclamacion !== undefined) e.fechaReclamacion = limpio(c.fechaReclamacion, 10);
      if (c.respuestaEntidad !== undefined) e.respuestaEntidad = Boolean(c.respuestaEntidad);
      if (c.prescripcionControvertida !== undefined) e.prescripcionControvertida = Boolean(c.prescripcionControvertida);
      if (c.motivoApelacion !== undefined) e.motivoApelacion = limpio(c.motivoApelacion, 2000);

      ["nombre", "telefono", "email", "dni", "direccion", "iban", "observaciones"].forEach((k) => {
        if (c.cliente && c.cliente[k] !== undefined) e.cliente[k] = limpio(c.cliente[k], 300);
      });

      if (c.tarjeta) {
        ["entidad", "nombre", "canal", "conservaContrato"].forEach((k) => {
          if (c.tarjeta[k] !== undefined) e.tarjeta[k] = limpio(c.tarjeta[k], 120);
        });
        if (c.tarjeta.anio !== undefined) e.tarjeta.anio = parseInt(c.tarjeta.anio, 10) || 0;
        if (c.tarjeta.tae !== undefined) e.tarjeta.tae = Math.max(0, Number(c.tarjeta.tae) || 0);
        if (c.tarjeta.tipoMedio !== undefined) e.tarjeta.tipoMedio = Math.max(0, Number(c.tarjeta.tipoMedio) || 0);
        if (c.tarjeta.limite !== undefined) e.tarjeta.limite = Math.max(0, Number(c.tarjeta.limite) || 0);
        if (c.tarjeta.anosPagando !== undefined) e.tarjeta.anosPagando = Math.max(0, Number(c.tarjeta.anosPagando) || 0);
      }

      if (c.caso) {
        ["capitalDispuesto", "totalPagado", "deudaPendiente"].forEach((k) => {
          if (c.caso[k] !== undefined) e.caso[k] = Math.max(0, Number(c.caso[k]) || 0);
        });
        if (c.caso.situacion !== undefined) e.caso.situacion = limpio(c.caso.situacion, 20);
        if (Array.isArray(c.caso.indicios)) {
          e.caso.indicios = c.caso.indicios.map((x) => limpio(x, 40)).filter(Boolean).slice(0, 20);
        }
      }

      if (c.despacho) {
        e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {}, c.despacho);
        e.despacho.honorarios = Math.min(60, Math.max(0, Number(e.despacho.honorarios) || 25));
      }

      recalcular(e);
      anotar(e, "Actualización de datos");
      await guardar(e, MATERIA);
      return res.status(200).json({ expediente: e });
    }

    if (accion === "documento") {
      const e = await leer(limpio(d.id, 40), MATERIA);
      if (!e) return res.status(404).json({ error: "Expediente no encontrado." });
      e.despacho = Object.assign(despachoPorDefecto(), e.despacho || {});
      return res.status(200).json(generarDocumento(e, limpio(d.tipo, 20)));
    }

    if (accion === "borrar") {
      const ids = (Array.isArray(d.ids) ? d.ids : [d.id])
        .map((x) => limpio(x, 40)).filter(Boolean).slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: "No se ha indicado ningún expediente." });

      let borrados = 0;
      const noEncontrados = [];
      for (const id of ids) {
        const e = await leer(id, MATERIA);
        if (!e) { noEncontrados.push(id); continue; }
        await borrar(id, MATERIA);
        borrados++;
        console.log("Expediente revolving borrado", id, "por", control.sesion.correo);
      }
      if (!borrados) return res.status(404).json({ error: "No se ha encontrado ningún expediente de los indicados." });
      return res.status(200).json({ ok: true, borrados, noEncontrados });
    }

    return res.status(400).json({ error: "Acción no reconocida: " + accion });
  } catch (error) {
    console.error("Panel de revolving:", error);
    return res.status(500).json({ error: (error && error.message) || "Error inesperado en el servidor." });
  }
}
