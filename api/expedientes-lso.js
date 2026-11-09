/**
 * API del panel de Ley de Segunda Oportunidad.
 *
 * Acciones: diagnostico, listar, crear, abrir, actualizar, registrar, escrito,
 * guardarEscrito, word, correo, resumenDiario, borrar.
 * Exige la misma sesión que el resto del panel (api/admin.js).
 *
 * Los imports son estáticos a propósito: Vercel decide qué archivos empaqueta
 * analizando el código.
 */

import { exigirSesion } from "./_sesion.js";
import {
  almacenDisponible, listarResumenes, leerExpediente, borrarExpediente,
  guardarTextoEscrito, leerTextoEscrito
} from "./_almacen-lso.js";
import { probarAlmacen } from "./_almacen.js";
import { enviarCorreo, correoConfigurado } from "./_correo.js";
import {
  M, E, limpio, fecha, anotar, conDespacho, despachoPorDefecto, equipo, tarifas, hoy, FUENTES,
  nuevoExpediente, persistir, sanearAcreedores, sanearBienes, sanearCliente, sanearDocumentos,
  sanearJudicial, sanearPagos
} from "./_lso.js";
import { avisoAvance, listaDocumentos } from "./_correos-lso.js";
import { escritoAWord, nombreArchivo } from "./_word-lso.js";
import { prepararDiario } from "./_diario-lso.js";

const FASES = M.FASES.map((f) => f.id);
const nombreFase = (id) => (M.FASES.find((f) => f.id === id) || {}).nombre || id;

/** Días hábiles hasta el siguiente intento cuando el contacto no contesta. */
const ESPERAS = [1, 2, 4];

function sumarHabiles(desde, n, festivos) {
  let f = desde;
  for (let i = 0; i < n; i++) f = M.siguienteHabil(f, { festivosExtra: festivos });
  return f;
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
    const quien = control.sesion.nombre || control.sesion.correo;

    if (accion === "diagnostico") {
      return res.status(200).json({
        nodo: process.version,
        modulos: {
          "_sesion.js": typeof exigirSesion === "function" ? "cargado" : "ERROR",
          "_almacen-lso.js": typeof listarResumenes === "function" ? "cargado" : "ERROR",
          "lso-motor.js": M ? "cargado" : "ERROR",
          "lso-escritos.js": E ? "cargado" : "ERROR",
          "_word-lso.js (docx)": typeof escritoAWord === "function" ? "cargado" : "ERROR"
        },
        conexion_almacen: await probarAlmacen(),
        entorno: {
          almacen: almacenDisponible(),
          correo: correoConfigurado(),
          letrado: Boolean(process.env.DESPACHO_LETRADO),
          procurador: Boolean(process.env.DESPACHO_PROCURADOR),
          festivos_locales: Boolean(process.env.DESPACHO_FESTIVOS),
          reparto_por_turnos: Boolean(process.env.LSO_RESPONSABLES),
          tarifas_propias: Boolean(process.env.LSO_TARIFAS),
          recordatorios_al_cliente: process.env.LSO_RECORDATORIOS === "si",
          aviso_diario: Boolean(process.env.CRON_SECRET)
        }
      });
    }

    // El Word no necesita almacén: se genera con el texto que manda el panel.
    if (accion === "word") {
      const contenido = String(d.contenido || "").slice(0, 400000);
      if (!contenido.trim()) return res.status(400).json({ error: "El escrito está vacío." });
      const titulo = limpio(d.titulo, 200) || "Escrito";
      const buffer = await escritoAWord(titulo, contenido);
      return res.status(200).json({
        nombre: nombreArchivo(limpio(d.referencia, 40), titulo),
        base64: Buffer.from(buffer).toString("base64")
      });
    }

    if (!almacenDisponible()) {
      return res.status(500).json({
        error: "El almacén de expedientes no está configurado. Añada KV_REST_API_URL y KV_REST_API_TOKEN en Vercel."
      });
    }

    if (accion === "listar") {
      return res.status(200).json({
        expedientes: await listarResumenes(),
        hoy: hoy(),
        festivos: despachoPorDefecto().festivos,
        equipo: equipo(),
        fuentes: FUENTES
      });
    }

    if (accion === "resumenDiario") {
      const diario = await prepararDiario({ enviar: d.enviar === true, recordar: false, siempre: true });
      return res.status(200).json(diario);
    }

    if (accion === "crear") {
      const c = sanearCliente(d.cliente);
      if (!c.nombre) return res.status(400).json({ error: "Indique al menos el nombre." });
      const e = nuevoExpediente({
        cliente: Object.assign({ telefono: "", email: "", provincia: "", canal: "llamada", franja: "indiferente", observaciones: "" }, c),
        respuestas: null,
        origen: { fuente: FUENTES[d.fuente] ? d.fuente : "telefono", campana: "", utm: {} },
        quien,
        asignado: limpio(d.asignado, 120) || quien
      });
      if (d.notas) anotar(e, quien, limpio(d.notas, 2000), "nota");
      await persistir(e);
      return res.status(200).json({ expediente: conDespacho(e) });
    }

    if (accion === "borrar") {
      const ids = (Array.isArray(d.ids) ? d.ids : [d.id]).map((x) => limpio(x, 40)).filter(Boolean).slice(0, 100);
      if (!ids.length) return res.status(400).json({ error: "No se ha indicado ningún expediente." });
      let borrados = 0;
      for (const id of ids) {
        const e = await leerExpediente(id);
        if (!e) continue;
        await borrarExpediente(id, e.cliente && e.cliente.telefono);
        borrados++;
        console.log("Expediente LSO borrado", id, "por", control.sesion.correo);
      }
      if (!borrados) return res.status(404).json({ error: "No se ha encontrado ningún expediente de los indicados." });
      return res.status(200).json({ ok: true, borrados });
    }

    // A partir de aquí todas las acciones son sobre un expediente.
    const e = await leerExpediente(limpio(d.id, 40));
    if (!e) return res.status(404).json({ error: "Expediente no encontrado." });

    if (accion === "abrir") {
      return res.status(200).json({ expediente: conDespacho(e), equipo: equipo(), hoy: hoy(), fuentes: FUENTES });
    }

    if (accion === "actualizar") {
      const c = d.cambios || {};
      const faseAntes = e.fase;

      if (c.fase && FASES.includes(c.fase) && c.fase !== e.fase) {
        e.fase = c.fase;
        e.faseCambiada = new Date().toISOString();
        anotar(e, quien, `Fase: ${nombreFase(faseAntes)} → ${nombreFase(e.fase)}`, "fase");
        if (M.FASES_CLIENTE.includes(e.fase) && !e.judicial) e.judicial = sanearJudicial(E.judicialInicial(e));
      }
      if (c.motivoDescarte !== undefined) e.motivoDescarte = limpio(c.motivoDescarte, 300);
      if (c.asignado !== undefined && c.asignado !== e.asignado) {
        e.asignado = limpio(c.asignado, 120);
        anotar(e, quien, e.asignado ? `Asignado a ${e.asignado}` : "Sin asignar", "sistema");
      }
      if (typeof c.notas === "string") e.notas = limpio(c.notas, 8000);
      if (c.proximoSeguimiento !== undefined) e.proximoSeguimiento = fecha(c.proximoSeguimiento);
      if (c.cita !== undefined) {
        const cita = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(c.cita)) ? String(c.cita) : "";
        if (cita && cita !== e.cita) anotar(e, quien, `Consulta fijada para el ${cita.slice(0, 10).split("-").reverse().join("/")} a las ${cita.slice(11)}`, "cita");
        e.cita = cita;
      }
      if (c.comercial !== undefined) e.comercial = Boolean(c.comercial);
      if (c.cliente) e.cliente = sanearCliente(c.cliente, e.cliente);
      if (c.respuestas && M.validarRespuestas(c.respuestas)) {
        e.respuestas = M.normalizarRespuestas(c.respuestas);
        e.resultado = M.evaluar(e.respuestas, tarifas());
        anotar(e, quien, "Respuestas del test corregidas y reevaluadas", "sistema");
      }
      if (c.documentos) {
        const antes = Object.values(e.documentos || {}).filter((x) => x.estado === "recibido" || x.estado === "validado").length;
        e.documentos = sanearDocumentos(c.documentos);
        const despues = Object.values(e.documentos).filter((x) => x.estado === "recibido" || x.estado === "validado").length;
        if (despues !== antes) anotar(e, quien, `Documentación: ${despues} documento${despues === 1 ? "" : "s"} recibido${despues === 1 ? "" : "s"}`, "documento");
      }
      if (c.honorarios) {
        e.honorarios = {
          importe: Math.max(0, Math.round((Number(c.honorarios.importe) || 0) * 100) / 100),
          pagos: sanearPagos(c.honorarios.pagos)
        };
      }
      if (c.judicial) e.judicial = sanearJudicial(c.judicial);
      if (c.acreedores) e.acreedores = sanearAcreedores(c.acreedores);
      if (c.bienes) e.bienes = sanearBienes(c.bienes);
      if (c.despacho) {
        const dd = c.despacho;
        e.despacho = {
          letrado: limpio(dd.letrado, 160),
          colegiado: limpio(dd.colegiado, 20),
          colegio: limpio(dd.colegio, 80),
          procurador: limpio(dd.procurador, 160)
        };
      }

      await persistir(e);

      let aviso = "";
      if (c.avisarCliente && e.fase !== faseAntes && e.cliente && e.cliente.email && correoConfigurado()) {
        const m = avisoAvance(e);
        if (m) {
          try {
            await enviarCorreo({ remitente: "JURMIA Abogados", para: e.cliente.email, asunto: m.asunto, html: m.html });
            anotar(e, quien, `Aviso de avance enviado al cliente: ${m.asunto}`, "email");
            await persistir(e);
            aviso = "Se ha avisado al cliente por correo.";
          } catch (err) {
            aviso = "No se pudo enviar el aviso al cliente: " + err.message;
          }
        }
      }
      return res.status(200).json({ expediente: conDespacho(e), aviso });
    }

    if (accion === "registrar") {
      const tipo = ["llamada", "whatsapp", "email", "nota"].includes(d.tipo) ? d.tipo : "nota";
      const resultado = ["contesta", "no_contesta"].includes(d.resultado) ? d.resultado : "";
      const texto = limpio(d.texto, 2000);
      const etiquetas = { llamada: "Llamada", whatsapp: "WhatsApp", email: "Correo", nota: "Nota" };
      const partes = [etiquetas[tipo]];
      if (resultado === "contesta") partes.push("contesta");
      if (resultado === "no_contesta") partes.push("no contesta");
      anotar(e, quien, partes.join(" · ") + (texto ? ": " + texto : ""), tipo);

      if (tipo !== "nota" && resultado !== "no_contesta" && !e.primerContacto) e.primerContacto = new Date().toISOString();
      if (tipo !== "nota" && e.fase === "nuevo") {
        e.fase = "contactado";
        e.faseCambiada = new Date().toISOString();
        anotar(e, quien, "Fase: Nuevo → Contactado", "fase");
      }
      const festivos = despachoPorDefecto().festivos;
      if (resultado === "no_contesta") {
        e.intentos = (e.intentos || 0) + 1;
        e.proximoSeguimiento = sumarHabiles(hoy(), ESPERAS[Math.min(e.intentos - 1, ESPERAS.length - 1)], festivos);
      } else if (resultado === "contesta") {
        e.intentos = 0;
        if (e.proximoSeguimiento && e.proximoSeguimiento <= hoy()) e.proximoSeguimiento = "";
      }
      await persistir(e);
      return res.status(200).json({ expediente: conDespacho(e) });
    }

    if (accion === "escrito") {
      const clave = limpio(d.clave, 120);
      return res.status(200).json({
        contenido: await leerTextoEscrito(e.id, clave),
        meta: (e.escritos || {})[clave] || null
      });
    }

    if (accion === "guardarEscrito") {
      const clave = limpio(d.clave, 120);
      const tipo = limpio(d.tipo, 40);
      if (!E.definicion(tipo) || !clave.startsWith(tipo)) return res.status(400).json({ error: "Tipo de escrito desconocido." });
      const contenido = String(d.contenido || "").slice(0, 400000);
      if (!contenido.trim()) return res.status(400).json({ error: "El escrito está vacío." });
      const estado = ["borrador", "revisado", "presentado"].includes(d.estado) ? d.estado : "borrador";
      const faltan = E.pendientes(contenido);
      if (estado !== "borrador" && faltan.length) {
        return res.status(400).json({ error: `${faltan.length === 1 ? "Queda 1 dato" : `Quedan ${faltan.length} datos`} por completar: ${faltan.slice(0, 4).join(", ")}${faltan.length > 4 ? "…" : ""}` });
      }
      e.escritos = e.escritos || {};
      const ahora = new Date().toISOString();
      const previo = e.escritos[clave] || { creado: ahora, autor: quien };
      const meta = Object.assign({}, previo, {
        tipo,
        refId: limpio(d.refId, 40) || undefined,
        titulo: limpio(d.titulo, 200) || E.definicion(tipo).nombre,
        estado,
        actualizado: ahora
      });
      if (estado === "revisado" && previo.estado !== "revisado") Object.assign(meta, { revisadoPor: quien, revisadoEn: ahora });
      if (estado === "presentado") {
        meta.presentadoEn = fecha(d.presentadoEn) || meta.presentadoEn || hoy();
        meta.justificante = limpio(d.justificante, 120);
      }
      e.escritos[clave] = meta;
      await guardarTextoEscrito(e.id, clave, contenido);
      if (previo.estado !== estado || !e.escritos[clave].creado) {
        anotar(e, quien, `Escrito «${meta.titulo}»: ${estado}${estado === "presentado" && meta.justificante ? " (justificante " + meta.justificante + ")" : ""}`, "escrito");
      }
      await persistir(e);
      return res.status(200).json({ expediente: conDespacho(e), meta });
    }

    if (accion === "correo") {
      if (!correoConfigurado()) return res.status(400).json({ error: "El correo del despacho no está configurado (SMTP_USUARIO, SMTP_CLAVE, CORREO_DESTINO)." });
      const para = e.cliente && e.cliente.email;
      if (!para) return res.status(400).json({ error: "El cliente no tiene correo electrónico." });
      let m = null;
      if (d.plantilla === "documentacion") m = listaDocumentos(e, limpio(d.nota, 2000));
      else if (d.plantilla === "avance") m = avisoAvance(e);
      if (!m) return res.status(400).json({ error: "No hay nada que enviar con esa plantilla en esta fase." });
      if (m.pendientes === 0) return res.status(400).json({ error: "No hay documentos pendientes." });
      await enviarCorreo({ remitente: "JURMIA Abogados", para, asunto: m.asunto, html: m.html });
      anotar(e, quien, `Correo al cliente: ${m.asunto}`, "email");
      await persistir(e);
      return res.status(200).json({ expediente: conDespacho(e), ok: true });
    }

    return res.status(400).json({ error: "Acción no reconocida: " + accion });
  } catch (error) {
    console.error("Panel de segunda oportunidad:", error);
    return res.status(500).json({ error: (error && error.message) || "Error inesperado en el servidor." });
  }
}
