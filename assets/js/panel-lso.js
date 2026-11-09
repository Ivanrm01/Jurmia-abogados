/**
 * Panel de Ley de Segunda Oportunidad (/admin/segunda-oportunidad).
 *
 * Vistas: resumen, contactos, expedientes, plazos y escritos, ficha de cada
 * expediente y editor de escritos. Se navega con el «#» de la dirección, de
 * modo que los enlaces de los correos abren directamente cada expediente.
 *
 * Usa la misma sesión que el resto del panel (api/admin.js) y habla con
 * /api/expedientes-lso. Los cálculos (exoneración, plazos, escritos) salen de
 * lso-motor.js y lso-escritos.js, los mismos que usa el servidor.
 */
(function () {
  "use strict";

  const M = window.MotorLSO;
  const E = window.EscritosLSO;
  const $ = (id) => document.getElementById(id);
  const vista = $("vista");

  /* ================================================================== */
  /* Utilidades                                                          */
  /* ================================================================== */

  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euros = (n) => M.euros(Math.round((Number(n) || 0) * 100) / 100);
  const fc = (f) => (f ? String(f).slice(0, 10).split("-").reverse().join("/") : "");
  const fh = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  };
  const hace = (iso) => {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (!isFinite(min)) return "";
    if (min < 60) return `hace ${Math.max(1, min)} min`;
    if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
    const d = Math.round(min / 1440);
    return `hace ${d} día${d === 1 ? "" : "s"}`;
  };
  const nombreFase = (id) => (M.FASES.find((f) => f.id === id) || {}).nombre || id;
  const opciones = (lista, actual) => lista.map(([v, t]) =>
    `<option value="${esc(v)}"${String(v) === String(actual == null ? "" : actual) ? " selected" : ""}>${esc(t)}</option>`).join("");
  const nuevoId = () => Math.random().toString(36).slice(2, 10);
  const valor = (id) => { const el = $(id); return el ? el.value.trim() : ""; };
  const telefonoE164 = (t) => String(t || "").replace(/[^\d+]/g, "");
  const whatsapp = (t) => { const d = String(t || "").replace(/\D/g, ""); return "https://wa.me/" + (d.length === 9 ? "34" + d : d); };

  const VIAS = { sin_masa: "Sin masa", liquidacion: "Liquidación", plan_pagos: "Plan de pagos", microempresa: "Microempresas" };
  const ENCAJE = { alto: ["Encaja", "m-verde"], medio: ["Puede encajar", "m-ambar"], estudio: ["A estudiar", "m-gris"] };
  const PRIORIDAD = { caliente: ["Prioritario", "m-rojo"], templado: ["Interesante", "m-ambar"], frio: ["Frío", "m-gris"] };
  const ESTADO_ESCRITO = { pendiente: ["Por redactar", "m-gris"], borrador: ["Borrador", "m-ambar"], revisado: ["Revisado", "m-tinta"], presentado: ["Presentado", "m-verde"] };
  const marca = (par) => (par ? `<span class="marca ${par[1]}">${esc(par[0])}</span>` : "");
  const URGENCIA = { embargo: "Embargo", demanda: "Demanda", subasta: "Subasta", otra: "Urgente" };
  const marcaUrgente = (tipo) => (tipo ? `<span class="marca m-rojo lleno" title="Entró por la vía urgente">⚡ ${esc(URGENCIA[tipo] || "Urgente")}</span>` : "");
  const marcaFase = (f) => {
    const cls = f === "nuevo" ? "m-rojo" : f === "descartado" ? "m-gris" : M.FASES_CLIENTE.includes(f) ? "m-verde" : "m-tinta";
    return `<span class="marca ${cls}">${esc(nombreFase(f))}</span>`;
  };

  /* ================================================================== */
  /* Sesión y API                                                        */
  /* ================================================================== */

  const almacenSesion = {
    leer: (k) => { try { return localStorage.getItem(k) || sessionStorage.getItem(k) || null; } catch (e) { return null; } },
    guardar: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    borrar: (k) => {
      try { localStorage.removeItem(k); } catch (e) { /* nada */ }
      try { sessionStorage.removeItem(k); } catch (e) { /* nada */ }
    }
  };
  let token = almacenSesion.leer("jurmia_token");
  let usuario = null;
  try { usuario = JSON.parse(almacenSesion.leer("jurmia_usuario") || "null"); } catch (e) { usuario = null; }

  function peticion(ruta, cuerpo) {
    return fetch(ruta, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
      body: JSON.stringify(cuerpo)
    }).then((r) => r.text().then((texto) => {
      let d = null;
      if (texto) { try { d = JSON.parse(texto); } catch (e) { d = null; } }
      if (d === null) {
        throw new Error("el servidor respondió con HTTP " + r.status + " y un contenido que no es JSON" +
          (texto ? ": " + texto.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : " (respuesta vacía)"));
      }
      if (r.status === 401 && ruta !== "/api/admin") {
        almacenSesion.borrar("jurmia_token");
        S.sucio = false;
        location.reload();
      }
      if (!r.ok) throw new Error(d.error || "el servidor respondió con HTTP " + r.status);
      return d;
    }));
  }
  const api = (cuerpo) => peticion("/api/expedientes-lso", cuerpo);

  function mensaje(destino, texto, tipo) {
    const caja = typeof destino === "string" ? $(destino) : destino;
    if (caja) caja.innerHTML = texto ? `<div class="mensaje ${tipo || ""}">${esc(texto)}</div>` : "";
  }

  /* ---------------- acceso ---------------- */

  function entrar() {
    mensaje("mensaje-acceso", "");
    $("btn-entrar").disabled = true;
    peticion("/api/admin", { accion: "entrar", correo: valor("correo"), clave: $("clave").value })
      .then((d) => {
        token = d.token;
        usuario = { nombre: d.nombre, correo: d.correo };
        almacenSesion.guardar("jurmia_token", token);
        almacenSesion.guardar("jurmia_usuario", JSON.stringify(usuario));
        abrirPanel();
      })
      .catch((e) => mensaje("mensaje-acceso", e.message, "error"))
      .then(() => { $("btn-entrar").disabled = false; });
  }
  $("btn-entrar").addEventListener("click", entrar);
  $("clave").addEventListener("keydown", (e) => { if (e.key === "Enter") entrar(); });
  $("btn-salir").addEventListener("click", () => {
    almacenSesion.borrar("jurmia_token");
    almacenSesion.borrar("jurmia_usuario");
    S.sucio = false;
    location.reload();
  });

  function abrirPanel() {
    document.body.classList.add("identificado");
    $("acceso").classList.add("oculto");
    $("panel").classList.remove("oculto");
    if (usuario) $("sesion-nombre").textContent = usuario.nombre;
    cargarPanel();
  }

  function cargarPanel() {
    vista.innerHTML = '<p class="apunte">Cargando los expedientes…</p>';
    cargarLista().then(enrutar).catch((e) => {
      vista.innerHTML = `<div class="mensaje error">No se pudo cargar el panel: ${esc(e.message)}</div>
        <p><button type="button" class="secundario" id="btn-reintentar">Reintentar</button></p>`;
      const b = $("btn-reintentar");
      if (b) b.addEventListener("click", cargarPanel);
    });
  }

  /* ================================================================== */
  /* Estado y navegación                                                 */
  /* ================================================================== */

  const S = {
    lista: [], hoy: "", festivos: [], equipo: [], fuentes: {},
    actual: null, trabajo: null, pestana: "resumen", sucio: false, hash: "",
    editor: null, filtros: {}
  };
  const op = () => ({ festivosExtra: S.festivos });

  function cargarLista() {
    return api({ accion: "listar" }).then((d) => {
      S.lista = d.expedientes || [];
      S.hoy = d.hoy;
      S.festivos = d.festivos || [];
      S.equipo = d.equipo || [];
      S.fuentes = d.fuentes || {};
      contadores();
    });
  }

  function marcarSucio(si) {
    S.sucio = si;
    const barra = $("barra-guardar");
    if (barra) barra.classList.toggle("oculto", !si);
  }
  window.addEventListener("beforeunload", (e) => {
    if (S.sucio) { e.preventDefault(); e.returnValue = ""; }
  });

  function ir(hash) {
    if (decodeURIComponent(location.hash.slice(1)) === hash) enrutar();
    else location.hash = hash;
  }

  window.addEventListener("hashchange", enrutar);

  function enrutar() {
    if (!token) return;
    const h = decodeURIComponent(location.hash.slice(1));
    if (S.sucio && h !== S.hash) {
      if (!confirm("Hay cambios sin guardar en este expediente. ¿Salir sin guardarlos?")) {
        history.replaceState(null, "", "#" + S.hash);
        return;
      }
      marcarSucio(false);
    }
    S.hash = h;
    document.querySelectorAll("#pestanas-panel button").forEach((b) => {
      const v = b.getAttribute("data-vista");
      b.setAttribute("aria-selected", String(v === (h || "resumen")));
    });
    const listas = { resumen: vistaResumen, contactos: vistaContactos, expedientes: vistaExpedientes, escritos: vistaEscritos };
    if (listas[h || "resumen"]) return verLista(h || "resumen", listas[h || "resumen"]);
    if (h.startsWith("escrito/")) {
      const partes = h.split("/");
      return abrirEditor(partes[1], partes.slice(2).join("/"));
    }
    const [id, pestana] = h.split("/");
    return abrirFicha(id, pestana || "resumen");
  }

  /**
   * Pinta una vista de listado con lo que ya hay en memoria y la refresca en
   * cuanto llega el listado del servidor (si sigue abierta y no se está escribiendo).
   */
  function verLista(h, pintar) {
    pintar();
    const antes = JSON.stringify(S.lista);
    cargarLista().then(() => {
      if (S.hash !== h && !(h === "resumen" && S.hash === "")) return;
      const activo = document.activeElement;
      if (activo && vista.contains(activo) && /INPUT|SELECT|TEXTAREA/.test(activo.tagName)) return;
      if (JSON.stringify(S.lista) !== antes) pintar();
    }).catch(() => {});
  }

  $("pestanas-panel").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-vista]");
    if (b) ir(b.getAttribute("data-vista"));
  });

  // Cualquier elemento con data-ir navega (filas, avisos, enlaces internos).
  vista.addEventListener("click", (e) => {
    const boton = e.target.closest("button[data-ir]");
    if (boton) return ir(boton.getAttribute("data-ir"));
    if (e.target.closest("a[href], button, input, select, textarea, label")) return;
    const el = e.target.closest("[data-ir]");
    if (el) ir(el.getAttribute("data-ir"));
  });

  /* ================================================================== */
  /* Derivados del listado                                               */
  /* ================================================================== */

  const esCaptacion = (x) => M.FASES_CAPTACION.includes(x.fase);
  const esClienteActivo = (x) => M.FASES_EXPEDIENTE.includes(x.fase);
  const sinLlamar = (x) => x.fase === "nuevo" && !x.primerContacto;
  const seguimientoHoy = (x) => x.proximoSeguimiento && x.proximoSeguimiento <= S.hoy && !["descartado", "exonerado", "nuevo"].includes(x.fase);
  const restantes = (vence) => M.habilesRestantes(S.hoy, vence, op());

  function todosLosPlazos() {
    const out = [];
    S.lista.filter((x) => !["descartado", "exonerado"].includes(x.fase)).forEach((x) =>
      (x.plazos || []).forEach((p) => out.push(Object.assign({ expediente: x.id, cliente: x.nombre, restantes: restantes(p.vence) }, p))));
    return out.sort((a, b) => a.restantes - b.restantes);
  }

  function chipPlazo(p) {
    const r = p.restantes != null ? p.restantes : restantes(p.vence);
    const cls = r <= 2 ? "urgente" : r <= 5 ? "pronto" : "lejos";
    const texto = r < 0 ? "Vencido" : r === 0 ? "Vence hoy" : `${r} día${r === 1 ? "" : "s"} háb.`;
    return `<span class="plazo-chip ${cls}">${texto}</span>`;
  }

  function contadores() {
    $("cuenta-contactos").textContent = S.lista.filter(esCaptacion).length || "";
    $("cuenta-expedientes").textContent = S.lista.filter(esClienteActivo).length || "";
    const urgentes = todosLosPlazos().filter((p) => p.restantes <= 5).length;
    $("cuenta-escritos").textContent = urgentes ? "· " + urgentes : "";
  }

  /* ================================================================== */
  /* Vista: resumen                                                      */
  /* ================================================================== */

  function botoneraGeneral() {
    return `<div class="botonera">
      <button id="btn-nuevo">+ Nuevo contacto</button>
      <button class="secundario" id="btn-diario" title="Envía al despacho el resumen de lo que pide atención hoy">Resumen de hoy por correo</button>
      <button class="secundario" id="btn-diagnostico">Diagnóstico</button>
    </div>`;
  }

  function enlazarBotoneraGeneral() {
    $("btn-nuevo").addEventListener("click", formularioNuevo);
    $("btn-diario").addEventListener("click", function () {
      const b = this;
      b.disabled = true;
      mensaje("salida-general", "Preparando el resumen…");
      api({ accion: "resumenDiario", enviar: true })
        .then((d) => mensaje("salida-general", d.enviado
          ? `Enviado al despacho: «${d.asunto}».`
          : `Resumen preparado (${d.total} asuntos), pero el correo no está configurado: revise SMTP_USUARIO, SMTP_CLAVE y CORREO_DESTINO.`))
        .catch((e) => mensaje("salida-general", e.message, "error"))
        .then(() => { b.disabled = false; });
    });
    $("btn-diagnostico").addEventListener("click", () => {
      const caja = $("salida-general");
      caja.innerHTML = '<div class="mensaje">Comprobando el servidor…</div>';
      api({ accion: "diagnostico" }).then((d) => {
        const filas = Object.keys(d.modulos).map((k) => `<tr><td>${esc(k)}</td><td style="color:${d.modulos[k] === "cargado" ? "var(--verde)" : "var(--rojo)"}">${esc(d.modulos[k])}</td></tr>`).join("");
        const entorno = Object.keys(d.entorno).map((k) => `<tr><td>${esc(k.replace(/_/g, " "))}</td><td style="color:${d.entorno[k] ? "var(--verde)" : "var(--tinta-media)"}">${d.entorno[k] ? "configurado" : "sin configurar"}</td></tr>`).join("");
        caja.innerHTML = `<div class="caja"><span class="rotulo">Estado del servidor · Node ${esc(d.nodo)}</span><table style="font-size:.8125rem"><tbody>${filas}${entorno}</tbody></table></div>`;
      }).catch((e) => { caja.innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`; });
    });
  }

  function formularioNuevo() {
    const caja = $("caja-nuevo");
    if (!caja) return;
    if (caja.innerHTML) { caja.innerHTML = ""; return; }
    const fuentes = ["telefono", "referido", "colaborador", "directo", "seo", "google_ads", "meta_ads", "tiktok"]
      .map((k) => [k, S.fuentes[k] || k]);
    caja.innerHTML = `<div class="caja">
      <span class="rotulo">Nuevo contacto</span>
      <p class="apunte">Para quien llama o viene al despacho sin pasar por la web. El test puede rellenarse después desde su ficha.</p>
      <div class="rejilla">
        <div class="campo"><label for="n-nombre">Nombre y apellidos</label><input id="n-nombre" autocomplete="off"></div>
        <div class="campo"><label for="n-telefono">Teléfono</label><input id="n-telefono" type="tel"></div>
        <div class="campo"><label for="n-email">Correo</label><input id="n-email" type="email"></div>
        <div class="campo"><label for="n-provincia">Provincia</label><select id="n-provincia"><option value="">Sin indicar</option>${opciones(M.PROVINCIAS.map((p) => [p, p]))}</select></div>
        <div class="campo"><label for="n-fuente">Cómo nos ha conocido</label><select id="n-fuente">${opciones(fuentes, "telefono")}</select></div>
        <div class="campo"><label for="n-asignado">Responsable</label><select id="n-asignado">${opciones(S.equipo.map((n) => [n, n]), usuario && usuario.nombre)}</select></div>
        <div class="campo ancho"><label for="n-notas">Notas</label><textarea id="n-notas" rows="2"></textarea></div>
      </div>
      <div class="botonera"><button id="n-crear">Crear y abrir la ficha</button><button class="secundario" id="n-cancelar">Cancelar</button></div>
      <div id="n-mensaje"></div>
    </div>`;
    $("n-nombre").focus();
    $("n-cancelar").addEventListener("click", () => { caja.innerHTML = ""; });
    $("n-crear").addEventListener("click", function () {
      if (!valor("n-nombre")) return mensaje("n-mensaje", "Indique al menos el nombre.", "error");
      this.disabled = true;
      api({
        accion: "crear",
        cliente: { nombre: valor("n-nombre"), telefono: valor("n-telefono"), email: valor("n-email"), provincia: valor("n-provincia") },
        fuente: valor("n-fuente"), asignado: valor("n-asignado"), notas: valor("n-notas")
      }).then((d) => cargarLista().then(() => ir(d.expediente.id)))
        .catch((e) => { mensaje("n-mensaje", e.message, "error"); this.disabled = false; });
    });
  }

  function vistaResumen() {
    S.actual = null;
    const L = S.lista;
    const plazos = todosLosPlazos();
    const plazosCerca = plazos.filter((p) => p.restantes <= 5);
    const nuevos = L.filter(sinLlamar).sort((a, b) => (Boolean(b.urgente) - Boolean(a.urgente)) || (a.creado < b.creado ? -1 : 1));
    const urgentes = nuevos.filter((x) => x.urgente).length;
    const seguimientos = L.filter(seguimientoHoy);
    const captacion = L.filter(esCaptacion);
    const activos = L.filter(esClienteActivo);
    const porRedactar = L.filter(esClienteActivo).reduce((s, x) => s + (x.porRedactar || []).length, 0);
    const docsAtascados = L.filter((x) => x.fase === "documentacion" && x.docs && x.docs.ok < x.docs.total &&
      (Date.parse(S.hoy) - Date.parse(String(x.faseCambiada).slice(0, 10))) / 86400000 >= 7);
    const cuotas = L.filter((x) => x.cuotaVencida && x.fase !== "descartado");
    const honorarios = L.filter((x) => M.FASES_CLIENTE.includes(x.fase));
    const facturado = honorarios.reduce((s, x) => s + (x.honorarios || 0), 0);
    const cobrado = honorarios.reduce((s, x) => s + (x.cobrado || 0), 0);
    const prevision = L.filter((x) => x.fase === "propuesta").reduce((s, x) => s + (x.honorarios || 0), 0);

    const fechaHoy = new Date(S.hoy + "T12:00:00Z").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

    const filaAt = (id, titulo, detalle, derecha) =>
      `<li data-ir="${esc(id)}"><div><b>${titulo}</b><p>${detalle}</p></div><div class="der">${derecha}</div></li>`;
    const grupo = (titulo, filas, vacio) => `<div class="grupo-atencion"><span class="rotulo">${titulo}${filas.length ? ` · ${filas.length}` : ""}</span>${filas.length ? `<ul class="lista-atencion">${filas.join("")}</ul>` : `<p class="vacio">${vacio}</p>`}</div>`;

    const embudo = M.FASES.filter((f) => f.id !== "descartado").map((f) => [f, L.filter((x) => x.fase === f.id).length]);
    const maxEmbudo = Math.max(1, ...embudo.map(([, n]) => n));
    const fuentes = {};
    L.forEach((x) => {
      const k = x.fuente || "directo";
      fuentes[k] = fuentes[k] || { total: 0, clientes: 0 };
      fuentes[k].total++;
      if (M.FASES_CLIENTE.includes(x.fase)) fuentes[k].clientes++;
    });

    vista.innerHTML = `
      <div class="cabeza-vista">
        <div><h1>Segunda oportunidad</h1><p class="apunte" style="margin:0">Hoy es ${esc(fechaHoy)} · ${L.length} contacto${L.length === 1 ? "" : "s"} en total</p></div>
        ${botoneraGeneral()}
      </div>
      <div id="caja-nuevo"></div>
      <div id="salida-general"></div>

      <div class="kpis">
        <button class="kpi${nuevos.length ? " alerta" : ""}" data-ir="contactos" data-filtro="sinllamar"><small>Sin llamar</small><b>${nuevos.length}</b><span>${urgentes ? `${urgentes} urgente${urgentes === 1 ? "" : "s"} · llamar ya` : "contactos nuevos"}</span></button>
        <button class="kpi${seguimientos.length ? " alerta" : ""}" data-ir="contactos" data-filtro="seguimiento"><small>Seguimientos hoy</small><b>${seguimientos.length}</b><span>llamadas pendientes</span></button>
        <button class="kpi" data-ir="contactos"><small>En captación</small><b>${captacion.length}</b><span>${euros(prevision)} en propuestas</span></button>
        <button class="kpi" data-ir="expedientes"><small>Clientes activos</small><b>${activos.length}</b><span>${porRedactar} escrito${porRedactar === 1 ? "" : "s"} por redactar</span></button>
        <button class="kpi${plazosCerca.some((p) => p.restantes <= 2) ? " alerta" : ""}" data-ir="escritos"><small>Plazos en 5 días</small><b>${plazosCerca.length}</b><span>${plazos.length} plazo${plazos.length === 1 ? "" : "s"} abierto${plazos.length === 1 ? "" : "s"}</span></button>
        <div class="kpi"><small>Honorarios clientes</small><b>${euros(facturado)}</b><span>${euros(cobrado)} cobrados</span></div>
      </div>

      <div class="dos-col">
        <div class="caja">
          <h2 style="margin-bottom:1rem">Requiere atención</h2>
          ${grupo("Plazos procesales", plazosCerca.map((p) => filaAt(`escrito/${p.expediente}/${p.clave}`, esc(p.corto) + (p.etiqueta ? ` <span class="tenue">· ${esc(p.etiqueta)}</span>` : ""),
            `${esc(p.cliente)} · vence el ${fc(p.vence)}, gracia hasta las 15:00 del ${fc(p.gracia)} · ${esc((ESTADO_ESCRITO[p.estado] || [p.estado])[0])}`, chipPlazo(p))), "Ningún plazo vence en los próximos cinco días hábiles.")}
          ${grupo("Contactos sin llamar", nuevos.slice(0, 12).map((x) => filaAt(x.id, esc(x.nombre) + (x.urgente ? " " + marcaUrgente(x.urgente) : ""),
            [`<a href="tel:${esc(telefonoE164(x.telefono))}">${esc(x.telefono)}</a>`, esc(VIAS[x.via] || ""), x.deuda ? esc(euros(x.deuda)) : "", esc(x.asignado || "")].filter(Boolean).join(" · "),
            `${marca(PRIORIDAD[x.prioridad])}<br><span class="tenue">${esc(hace(x.creado))}</span>`)), "Todos los contactos nuevos tienen ya una primera llamada.")}
          ${grupo("Seguimientos para hoy", seguimientos.map((x) => filaAt(x.id, esc(x.nombre),
            `<a href="tel:${esc(telefonoE164(x.telefono))}">${esc(x.telefono)}</a> · ${esc(nombreFase(x.fase))}${x.asignado ? " · " + esc(x.asignado) : ""}`, `<span class="tenue">${fc(x.proximoSeguimiento)}</span>`)), "No hay seguimientos programados para hoy.")}
          ${grupo("Documentación atascada", docsAtascados.map((x) => filaAt(x.id + "/documentacion", esc(x.nombre), `${x.docs.ok} de ${x.docs.total} documentos`, `<span class="tenue">desde ${fc(x.faseCambiada)}</span>`)), "Ningún expediente lleva más de una semana esperando papeles.")}
          ${grupo("Cuotas vencidas", cuotas.map((x) => filaAt(x.id + "/documentacion", esc(x.nombre), esc(x.telefono), `<span class="marca m-rojo">Impagada</span>`)), "No hay cuotas vencidas.")}
        </div>
        <div>
          <div class="caja">
            <h2 style="margin-bottom:.85rem">Embudo</h2>
            <div class="barras">${embudo.map(([f, n]) => `<div class="barra-fila"><span>${esc(f.nombre)}</span><div class="pista"><i style="width:${Math.round((n / maxEmbudo) * 100)}%"></i></div><span class="num der">${n}</span></div>`).join("")}</div>
            <p class="apunte" style="margin:.85rem 0 0">Descartados: ${L.filter((x) => x.fase === "descartado").length}</p>
          </div>
          <div class="caja">
            <h2 style="margin-bottom:.6rem">Origen de los contactos</h2>
            ${Object.keys(fuentes).length ? `<div class="tabla-scroll"><table><thead><tr><th>Canal</th><th class="der">Contactos</th><th class="der">Clientes</th><th class="der">Conversión</th></tr></thead><tbody>
              ${Object.keys(fuentes).sort((a, b) => fuentes[b].total - fuentes[a].total).map((k) => `<tr><td>${esc(S.fuentes[k] || k)}</td><td class="num der">${fuentes[k].total}</td><td class="num der">${fuentes[k].clientes}</td><td class="num der">${Math.round((fuentes[k].clientes / fuentes[k].total) * 100)} %</td></tr>`).join("")}
            </tbody></table></div>` : '<p class="vacio">Aún no hay contactos.</p>'}
            <p class="apunte" style="margin:.75rem 0 0">Etiquete los anuncios con utm_source, utm_medium y utm_campaign para distinguir cada campaña.</p>
          </div>
        </div>
      </div>`;
    enlazarBotoneraGeneral();
    vista.querySelectorAll(".kpi[data-filtro]").forEach((b) => b.addEventListener("click", () => { S.filtros.contactos = { especial: b.getAttribute("data-filtro") }; }, true));
  }

  /* ================================================================== */
  /* Vistas: contactos y expedientes                                     */
  /* ================================================================== */

  function tablaSeleccionable(id, cabeceras, filas, vacio) {
    return `<div class="seleccion" id="barra-seleccion"><b id="conteo-seleccion"></b>
        <button class="peligro" id="btn-borrar-lote">Eliminar definitivamente</button>
        <button class="secundario" id="btn-limpiar-seleccion">Quitar selección</button></div>
      <div class="caja tabla-lista" style="padding:.5rem"><div class="tabla-scroll"><table id="${id}">
        <thead><tr><th class="col-sel"><input type="checkbox" id="sel-todos" title="Seleccionar todo"></th>${cabeceras.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
        <tbody>${filas.join("") || `<tr><td colspan="${cabeceras.length + 1}" class="tenue">${vacio}</td></tr>`}</tbody>
      </table></div></div>`;
  }

  function enlazarSeleccion() {
    const sel = () => Array.from(vista.querySelectorAll("input[data-sel]:checked")).map((c) => c.getAttribute("data-sel"));
    const actualizar = () => {
      const n = sel().length;
      $("barra-seleccion").classList.toggle("visible", n > 0);
      $("conteo-seleccion").textContent = n === 1 ? "1 expediente seleccionado" : n + " expedientes seleccionados";
    };
    vista.addEventListener("change", (e) => { if (e.target.matches("input[data-sel]")) actualizar(); });
    $("sel-todos").addEventListener("change", function () {
      vista.querySelectorAll("input[data-sel]").forEach((c) => { c.checked = this.checked; });
      actualizar();
    });
    $("btn-limpiar-seleccion").addEventListener("click", () => {
      vista.querySelectorAll("input[data-sel]").forEach((c) => { c.checked = false; });
      $("sel-todos").checked = false;
      actualizar();
    });
    $("btn-borrar-lote").addEventListener("click", function () {
      const ids = sel();
      if (!ids.length) return;
      if (!confirm(`Se eliminarán definitivamente ${ids.length} expediente(s), con todos los datos de sus clientes y sus escritos:\n\n${ids.join("\n")}\n\nEsta acción no se puede deshacer. ¿Continuar?`)) return;
      this.disabled = true;
      api({ accion: "borrar", ids }).then(() => cargarLista()).then(enrutar).catch((e) => alert(e.message));
    });
  }

  function filtrosHtml(vistaId, fases, conPrioridad) {
    const f = S.filtros[vistaId] || {};
    return `<div class="filtros">
      <select id="f-fase">${opciones([["", "Todas las fases"]].concat(fases.map((x) => [x, nombreFase(x)])), f.fase)}</select>
      <select id="f-asignado">${opciones([["", "Todo el equipo"], ["-", "Sin asignar"]].concat(S.equipo.map((n) => [n, n])), f.asignado)}</select>
      ${conPrioridad ? `<select id="f-prioridad">${opciones([["", "Cualquier prioridad"], ["caliente", "Prioritarios"], ["templado", "Interesantes"], ["frio", "Fríos"]], f.prioridad)}</select>` : ""}
      <input type="search" id="f-texto" placeholder="Buscar por nombre, teléfono, correo o referencia" value="${esc(f.texto || "")}">
      ${f.especial ? `<button class="secundario mini" id="f-quitar">${f.especial === "sinllamar" ? "Solo sin llamar" : "Solo seguimientos de hoy"} ×</button>` : ""}
    </div>`;
  }

  function enlazarFiltros(vistaId, repintar) {
    const f = S.filtros[vistaId] = S.filtros[vistaId] || {};
    ["fase", "asignado", "prioridad", "texto"].forEach((k) => {
      const el = $("f-" + k);
      if (el) el.addEventListener(k === "texto" ? "input" : "change", () => { f[k] = el.value; repintar(); });
    });
    const q = $("f-quitar");
    if (q) q.addEventListener("click", () => { delete f.especial; repintar(true); });
  }

  function aplicarFiltros(lista, f) {
    const t = (f.texto || "").toLowerCase().trim();
    return lista.filter((x) => {
      if (f.fase && x.fase !== f.fase) return false;
      if (f.asignado === "-" && x.asignado) return false;
      if (f.asignado && f.asignado !== "-" && x.asignado !== f.asignado) return false;
      if (f.prioridad && x.prioridad !== f.prioridad) return false;
      if (f.especial === "sinllamar" && !sinLlamar(x)) return false;
      if (f.especial === "seguimiento" && !seguimientoHoy(x)) return false;
      if (t && (x.nombre + " " + x.telefono + " " + x.email + " " + x.id).toLowerCase().indexOf(t) === -1) return false;
      return true;
    });
  }

  function vistaContactos(soloTabla) {
    S.actual = null;
    const f = S.filtros.contactos = S.filtros.contactos || {};
    const fases = M.FASES_CAPTACION.concat(["descartado"]);
    let lista = S.lista.filter((x) => (f.fase ? true : esCaptacion(x)));
    const urgenteSinLlamar = (x) => Boolean(x.urgente) && sinLlamar(x);
    lista = aplicarFiltros(lista, f).sort((a, b) => (urgenteSinLlamar(b) - urgenteSinLlamar(a)) || (sinLlamar(b) - sinLlamar(a)) || (a.creado < b.creado ? 1 : -1));
    const filas = lista.map((x) => `<tr class="fila" data-ir="${esc(x.id)}">
      <td class="col-sel" data-t=""><input type="checkbox" data-sel="${esc(x.id)}" aria-label="Seleccionar ${esc(x.id)}"></td>
      <td data-t="Entrada" class="num">${fc(x.creado)}<br><span class="tenue">${esc(hace(x.creado))}</span></td>
      <td data-t=""><b>${esc(x.nombre)}</b>${x.urgente ? " " + marcaUrgente(x.urgente) : ""}<br><span class="tenue">${esc(x.id)}${x.provincia ? " · " + esc(x.provincia) : ""}</span></td>
      <td data-t="Teléfono"><a href="tel:${esc(telefonoE164(x.telefono))}">${esc(x.telefono || "—")}</a></td>
      <td data-t="Deuda" class="num der">${euros(x.deuda)}${x.cancelableDeclarado ? `<br><span class="tenue">≈ ${euros(x.cancelableDeclarado)} cancelable</span>` : ""}</td>
      <td data-t="Vía">${esc(VIAS[x.via] || "—")}</td>
      <td data-t="Valoración">${marca(ENCAJE[x.encaje])} ${marca(PRIORIDAD[x.prioridad])}</td>
      <td data-t="Fase">${marcaFase(x.fase)}${sinLlamar(x) ? ' <span class="marca m-rojo lleno">Llamar</span>' : ""}</td>
      <td data-t="Seguimiento" class="num">${x.proximoSeguimiento ? `<span${x.proximoSeguimiento <= S.hoy ? ' style="color:var(--rojo);font-weight:600"' : ""}>${fc(x.proximoSeguimiento)}</span>` : x.cita ? "Consulta " + fc(x.cita) : "—"}</td>
      <td data-t="Responsable">${esc(x.asignado || "—")}</td>
      <td data-t="Origen" class="tenue">${esc(S.fuentes[x.fuente] || x.fuente)}</td></tr>`);
    const tabla = tablaSeleccionable("tabla-contactos", ["Entrada", "Contacto", "Teléfono", "Deuda", "Vía", "Valoración", "Fase", "Seguimiento", "Responsable", "Origen"], filas, "Sin contactos que mostrar con estos filtros.");
    if (soloTabla === true && $("zona-tabla")) {
      $("zona-tabla").innerHTML = tabla;
      enlazarSeleccion();
      return;
    }
    vista.innerHTML = `
      <div class="cabeza-vista"><div><h1>Contactos</h1><p class="apunte" style="margin:0">Captación: de la primera llamada a la hoja de encargo.</p></div>${botoneraGeneral()}</div>
      <div id="caja-nuevo"></div><div id="salida-general"></div>
      ${filtrosHtml("contactos", fases, true)}
      <div id="zona-tabla">${tabla}</div>`;
    enlazarBotoneraGeneral();
    enlazarFiltros("contactos", (todo) => (todo ? vistaContactos() : vistaContactos(true)));
    enlazarSeleccion();
  }

  function vistaExpedientes(soloTabla) {
    S.actual = null;
    const f = S.filtros.expedientes = S.filtros.expedientes || {};
    const fases = M.FASES_CLIENTE;
    let lista = S.lista.filter((x) => (f.fase ? true : esClienteActivo(x)));
    lista = aplicarFiltros(lista, f).sort((a, b) => {
      const pa = (a.plazos || [])[0], pb = (b.plazos || [])[0];
      if (pa && pb) return pa.vence < pb.vence ? -1 : 1;
      if (pa || pb) return pa ? -1 : 1;
      return M.ordenFase(b.fase) - M.ordenFase(a.fase);
    });
    const filas = lista.map((x) => {
      const p = (x.plazos || []).slice().sort((a, b) => (a.vence < b.vence ? -1 : 1))[0];
      const pct = x.docs && x.docs.total ? Math.round((x.docs.ok / x.docs.total) * 100) : 0;
      return `<tr class="fila" data-ir="${esc(x.id)}">
        <td class="col-sel" data-t=""><input type="checkbox" data-sel="${esc(x.id)}" aria-label="Seleccionar ${esc(x.id)}"></td>
        <td data-t=""><b>${esc(x.nombre)}</b><br><span class="tenue">${esc(x.id)}${x.provincia ? " · " + esc(x.provincia) : ""}</span></td>
        <td data-t="Vía">${esc(VIAS[x.via] || "—")}</td>
        <td data-t="Fase">${marcaFase(x.fase)}</td>
        <td data-t="Documentación" class="num">${x.docs ? `${x.docs.ok}/${x.docs.total}` : "—"}<div class="progreso" style="margin:.25rem 0 0;width:70px"><i style="width:${pct}%"></i></div></td>
        <td data-t="Pasivo" class="num der">${euros(x.deuda)}${x.deudaReal ? "" : '<br><span class="tenue">estimado</span>'}</td>
        <td data-t="Próximo plazo">${p ? `${chipPlazo(p)}<br><span class="tenue">${esc(p.corto)} · ${fc(p.vence)}</span>` : '<span class="tenue">—</span>'}</td>
        <td data-t="Escritos" class="num">${(x.porRedactar || []).length ? `<span class="marca m-gris">${x.porRedactar.length} por redactar</span>` : ""} ${x.escritos && x.escritos.borradores ? `<span class="marca m-ambar">${x.escritos.borradores} borrador${x.escritos.borradores === 1 ? "" : "es"}</span>` : ""}</td>
        <td data-t="Responsable">${esc(x.asignado || "—")}</td></tr>`;
    });
    const tabla = tablaSeleccionable("tabla-expedientes", ["Cliente", "Vía", "Fase", "Documentación", "Pasivo", "Próximo plazo", "Escritos", "Responsable"], filas, "No hay expedientes con estos filtros.");
    if (soloTabla === true && $("zona-tabla")) {
      $("zona-tabla").innerHTML = tabla;
      enlazarSeleccion();
      return;
    }
    vista.innerHTML = `
      <div class="cabeza-vista"><div><h1>Expedientes</h1><p class="apunte" style="margin:0">Clientes con encargo firmado, de la documentación a la exoneración.</p></div>${botoneraGeneral()}</div>
      <div id="caja-nuevo"></div><div id="salida-general"></div>
      ${filtrosHtml("expedientes", fases, false)}
      <div id="zona-tabla">${tabla}</div>`;
    enlazarBotoneraGeneral();
    enlazarFiltros("expedientes", (todo) => (todo ? vistaExpedientes() : vistaExpedientes(true)));
    enlazarSeleccion();
  }

  /* ================================================================== */
  /* Vista: plazos y escritos                                            */
  /* ================================================================== */

  function vistaEscritos() {
    S.actual = null;
    const plazos = todosLosPlazos();
    const clientes = S.lista.filter(esClienteActivo);
    const porCliente = clientes.filter((x) => (x.porRedactar || []).length);
    const enCurso = [];
    clientes.forEach((x) => (x.enCurso || []).forEach((m) => enCurso.push(Object.assign({ expediente: x.id, cliente: x.nombre }, m))));
    enCurso.sort((a, b) => (a.actualizado < b.actualizado ? 1 : -1));

    vista.innerHTML = `
      <div class="cabeza-vista"><div><h1>Plazos y escritos</h1><p class="apunte" style="margin:0">Plazos en días hábiles: sin sábados, domingos, festivos${S.festivos.length ? " (incluidos los locales configurados)" : ""}, agosto ni del 24 de diciembre al 6 de enero.</p></div></div>
      <div class="caja">
        <h2 style="margin-bottom:.75rem">Plazos abiertos <span class="tenue">· ${plazos.length}</span></h2>
        ${plazos.length ? `<ul class="lista-atencion">${plazos.map((p) => `<li data-ir="escrito/${esc(p.expediente)}/${esc(p.clave)}">
          <div><b>${esc(p.corto)}${p.etiqueta ? ` <span class="tenue">· ${esc(p.etiqueta)}</span>` : ""}</b>
          <p>${esc(p.cliente)} · vence el ${fc(p.vence)} · día de gracia hasta las 15:00 del ${fc(p.gracia)} · aviso interno el ${fc(p.aviso)}</p></div>
          <div class="der">${chipPlazo(p)}<br>${marca(ESTADO_ESCRITO[p.estado])}</div></li>`).join("")}</ul>` : '<p class="vacio">No hay plazos abiertos. Aparecen al indicar en cada expediente las fechas de notificación (edicto, oposición, requerimientos…).</p>'}
      </div>
      <div class="dos-col">
        <div class="caja">
          <h2 style="margin-bottom:.75rem">Por redactar</h2>
          ${porCliente.length ? porCliente.map((x) => `<div class="grupo-atencion"><span class="rotulo"><a href="#${esc(x.id)}/escritos">${esc(x.nombre)}</a> · ${esc(nombreFase(x.fase))}</span>
            <ul class="lista-atencion">${x.porRedactar.map((n) => `<li data-ir="escrito/${esc(x.id)}/${esc(n.clave)}"><div><b>${esc(n.corto)}</b></div><div class="der"><span class="tenue">Redactar →</span></div></li>`).join("")}</ul></div>`).join("")
            : '<p class="vacio">Nada pendiente de redactar.</p>'}
        </div>
        <div class="caja">
          <h2 style="margin-bottom:.75rem">Borradores y revisados</h2>
          ${enCurso.length ? `<ul class="lista-atencion">${enCurso.map((m) => `<li data-ir="escrito/${esc(m.expediente)}/${esc(m.clave)}"><div><b>${esc(m.titulo)}</b><p>${esc(m.cliente)} · editado ${esc(fh(m.actualizado))}</p></div><div class="der">${marca(ESTADO_ESCRITO[m.estado])}</div></li>`).join("")}</ul>`
            : '<p class="vacio">No hay borradores en curso.</p>'}
        </div>
      </div>`;
  }

  /* ================================================================== */
  /* Ficha del expediente                                                */
  /* ================================================================== */

  const PESTANAS = [
    ["resumen", "Resumen"],
    ["documentacion", "Documentación y honorarios"],
    ["judicial", "Expediente judicial"],
    ["acreedores", "Acreedores y bienes"],
    ["escritos", "Escritos"],
    ["historial", "Historial"]
  ];

  function abrirFicha(id, pestana) {
    const pintar = () => {
      S.pestana = PESTANAS.some((p) => p[0] === pestana) ? pestana : "resumen";
      S.trabajo = {
        acreedores: JSON.parse(JSON.stringify(S.actual.acreedores || [])),
        bienes: JSON.parse(JSON.stringify(S.actual.bienes || [])),
        pagos: JSON.parse(JSON.stringify((S.actual.honorarios && S.actual.honorarios.pagos) || []))
      };
      pintarFicha();
    };
    if (S.actual && S.actual.id === id) return pintar();
    vista.innerHTML = '<p class="apunte">Abriendo el expediente…</p>';
    return api({ accion: "abrir", id }).then((d) => {
      S.actual = d.expediente;
      if (d.equipo) S.equipo = d.equipo;
      if (d.hoy) S.hoy = d.hoy;
      pintar();
    }).catch((e) => { vista.innerHTML = `<div class="mensaje error">${esc(e.message)}</div><p><a href="#contactos">Volver a contactos</a></p>`; });
  }

  /** Aplica la respuesta del servidor tras guardar y vuelve a pintar. */
  function refrescar(d, texto) {
    S.actual = d.expediente;
    marcarSucio(false);
    cargarLista().catch(() => {});
    abrirFicha(S.actual.id, S.pestana);
    if (texto) setTimeout(() => mensaje("mensaje-ficha", texto), 0);
  }

  function pintarFicha() {
    const e = S.actual;
    const c = e.cliente || {};
    const r = e.resultado;
    const puedeAvisar = c.email && ["contratado", "documentacion", "preparacion", "presentado", "concurso", "exonerado"];
    vista.innerHTML = `
      <p style="margin:0 0 .75rem"><a href="#${M.FASES_CLIENTE.includes(e.fase) ? "expedientes" : "contactos"}">← ${M.FASES_CLIENTE.includes(e.fase) ? "Expedientes" : "Contactos"}</a></p>
      <div class="caja">
        <div class="ficha-cabeza">
          <div>
            <span class="rotulo">Expediente ${esc(e.id)} · entrada ${fh(e.creado)}</span>
            <h1 class="ficha-nombre">${esc(c.nombre)}</h1>
            <div class="contacto-rapido">
              ${c.telefono ? `<a href="tel:${esc(telefonoE164(c.telefono))}">${esc(c.telefono)}</a><a href="${whatsapp(c.telefono)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
              ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '<span class="tenue">Sin correo</span>'}
              ${c.provincia ? `<span class="tenue">${esc(c.provincia)}</span>` : ""}
            </div>
            <div class="chips">
              ${e.urgente ? marcaUrgente(e.urgente.tipo) : ""}
              ${marcaFase(e.fase)}
              ${r ? marca(ENCAJE[r.encaje]) + " " + marca(PRIORIDAD[r.prioridad]) : '<span class="marca m-gris">Sin test</span>'}
              <span class="marca m-tinta">${esc(VIAS[(e.judicial && e.judicial.via) || (r && r.via)] || "Vía por decidir")}</span>
              <span class="marca m-gris">${esc(S.fuentes[(e.origen || {}).fuente] || (e.origen || {}).fuente || "directo")}</span>
              ${c.canal && c.canal !== "llamada" ? `<span class="marca m-gris">Prefiere ${esc({ whatsapp: "WhatsApp", email: "correo" }[c.canal])}</span>` : ""}
              ${c.franja && c.franja !== "indiferente" ? `<span class="marca m-gris">${c.franja === "manana" ? "Mañanas" : "Tardes"}</span>` : ""}
            </div>
          </div>
          <div class="ficha-mandos">
            <div><label for="c-fase">Fase</label><select id="c-fase">${opciones(M.FASES.map((f) => [f.id, f.nombre]), e.fase)}</select></div>
            <div><label for="c-asignado">Responsable</label><select id="c-asignado">${opciones([["", "Sin asignar"]].concat(S.equipo.map((n) => [n, n])), e.asignado)}</select></div>
          </div>
        </div>
        <div id="cambio-fase"></div>
        <div class="acciones-rapidas">
          <button class="secundario mini" data-registro="llamada|contesta">📞 Llamada: contesta</button>
          <button class="secundario mini" data-registro="llamada|no_contesta">📵 No contesta</button>
          <button class="secundario mini" data-registro="whatsapp|">💬 WhatsApp</button>
          <button class="secundario mini" data-registro="email|">✉️ Correo</button>
          <button class="secundario mini" data-registro="nota|">📝 Nota</button>
          ${c.email ? '<button class="secundario mini" id="btn-lista-docs">Enviar lista de documentos</button>' : ""}
        </div>
        <div id="zona-registro"></div>
        ${e.intentos ? `<p class="apunte" style="margin:.6rem 0 0">${e.intentos} intento${e.intentos === 1 ? "" : "s"} sin respuesta${e.proximoSeguimiento ? ` · próximo intento el ${fc(e.proximoSeguimiento)}` : ""}${e.intentos >= 4 ? " · valore pasarlo a descartado" : ""}</p>` : ""}
        <div id="mensaje-ficha"></div>
      </div>

      <nav class="pestanas" id="pestanas-ficha" role="tablist">${PESTANAS.map(([k, t]) => `<button role="tab" data-pestana="${k}" aria-selected="${k === S.pestana}">${t}${k === "escritos" ? cuentaEscritos() : ""}</button>`).join("")}</nav>
      <div id="contenido-ficha"></div>
      <div class="guardar-fijo oculto" id="barra-guardar"><span>Hay cambios sin guardar en esta pestaña.</span>
        <div class="botonera"><button class="secundario" id="btn-descartar">Descartar</button><button id="btn-guardar">Guardar cambios</button></div></div>`;

    $("pestanas-ficha").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-pestana]");
      if (b) ir(e.id + "/" + b.getAttribute("data-pestana"));
    });
    $("c-asignado").addEventListener("change", function () {
      api({ accion: "actualizar", id: e.id, cambios: { asignado: this.value } }).then((d) => refrescar(d, "Responsable actualizado.")).catch((er) => mensaje("mensaje-ficha", er.message, "error"));
    });
    $("c-fase").addEventListener("change", function () { cambioDeFase(this.value, puedeAvisar); });
    vista.querySelectorAll("[data-registro]").forEach((b) => b.addEventListener("click", () => abrirRegistro(b.getAttribute("data-registro"))));
    if ($("btn-lista-docs")) $("btn-lista-docs").addEventListener("click", enviarListaDocumentos);
    $("btn-guardar").addEventListener("click", guardarPestana);
    $("btn-descartar").addEventListener("click", () => { marcarSucio(false); abrirFicha(e.id, S.pestana); });

    const cont = $("contenido-ficha");
    ({ resumen: pestanaResumen, documentacion: pestanaDocumentacion, judicial: pestanaJudicial, acreedores: pestanaAcreedores, escritos: pestanaEscritos, historial: pestanaHistorial })[S.pestana](cont);
    cont.addEventListener("input", (ev) => { if (!ev.target.closest("[data-sin-cambios]")) marcarSucio(true); });
    cont.addEventListener("change", (ev) => { if (!ev.target.closest("[data-sin-cambios]")) marcarSucio(true); });
  }

  function cuentaEscritos() {
    try {
      const n = E.escritosDelExpediente(S.actual, new Date()).filter((x) => x.plazo && !(x.escrito && x.escrito.estado === "presentado")).length;
      return n ? ` <span class="cuenta">· ${n} plazo${n === 1 ? "" : "s"}</span>` : "";
    } catch (er) { return ""; }
  }

  function cambioDeFase(nueva, puedeAvisar) {
    const e = S.actual;
    const caja = $("cambio-fase");
    if (nueva === e.fase) { caja.innerHTML = ""; return; }
    const avisable = puedeAvisar && puedeAvisar.includes(nueva);
    caja.innerHTML = `<div class="registro">
      <b>Pasar de «${esc(nombreFase(e.fase))}» a «${esc(nombreFase(nueva))}»</b>
      ${nueva === "descartado" ? `<div class="campo" style="margin-top:.6rem"><label for="f-motivo">Motivo</label><select id="f-motivo">${opciones([["No contesta", "No contesta"], ["No encaja", "No encaja en la ley"], ["Precio", "No acepta el presupuesto"], ["Otro despacho", "Se va con otro despacho"], ["Negociación directa", "Negociará con los acreedores"], ["Otro", "Otro motivo"]])}</select></div>` : ""}
      ${avisable ? `<label class="casilla-linea"><input type="checkbox" id="f-avisar" checked> Avisar al cliente por correo de este avance</label>` : ""}
      ${nueva === "contratado" && !e.judicial ? '<p class="apunte" style="margin:.4rem 0">Se abrirá el expediente judicial con la sede de su provincia y la vía del test.</p>' : ""}
      <div class="botonera" style="margin-top:.5rem"><button id="f-confirmar">Cambiar fase</button><button class="secundario" id="f-cancelar">Cancelar</button></div></div>`;
    $("f-cancelar").addEventListener("click", () => { caja.innerHTML = ""; $("c-fase").value = e.fase; });
    $("f-confirmar").addEventListener("click", function () {
      this.disabled = true;
      const cambios = { fase: nueva, avisarCliente: Boolean($("f-avisar") && $("f-avisar").checked) };
      if ($("f-motivo")) cambios.motivoDescarte = $("f-motivo").value;
      api({ accion: "actualizar", id: e.id, cambios })
        .then((d) => refrescar(d, "Fase actualizada." + (d.aviso ? " " + d.aviso : "")))
        .catch((er) => { mensaje("mensaje-ficha", er.message, "error"); this.disabled = false; });
    });
  }

  function abrirRegistro(clave) {
    const [tipo, resultado] = clave.split("|");
    const titulos = { llamada: resultado === "no_contesta" ? "Llamada sin respuesta" : "Llamada", whatsapp: "WhatsApp", email: "Correo", nota: "Nota interna" };
    $("zona-registro").innerHTML = `<div class="registro">
      <label for="r-texto">${titulos[tipo]}${resultado === "no_contesta" ? " · se programará el siguiente intento" : ""}</label>
      <textarea id="r-texto" rows="2" placeholder="${resultado === "no_contesta" ? "Opcional: buzón de voz, número erróneo…" : "Qué se ha hablado, próximos pasos…"}"></textarea>
      <div class="botonera" style="margin-top:.5rem"><button id="r-guardar">Registrar</button><button class="secundario" id="r-cancelar">Cancelar</button></div></div>`;
    $("r-texto").focus();
    $("r-cancelar").addEventListener("click", () => { $("zona-registro").innerHTML = ""; });
    $("r-guardar").addEventListener("click", function () {
      this.disabled = true;
      api({ accion: "registrar", id: S.actual.id, tipo, resultado, texto: valor("r-texto") })
        .then((d) => refrescar(d, resultado === "no_contesta" ? `Registrado. Próximo intento: ${fc(d.expediente.proximoSeguimiento)}.` : "Registrado en el historial."))
        .catch((er) => { mensaje("mensaje-ficha", er.message, "error"); this.disabled = false; });
    });
  }

  function enviarListaDocumentos() {
    const nota = prompt("Se enviará al cliente la lista de documentos que faltan, con cómo conseguir cada uno.\n\nSi quiere, añada una nota (opcional):", "");
    if (nota === null) return;
    mensaje("mensaje-ficha", "Enviando…");
    api({ accion: "correo", id: S.actual.id, plantilla: "documentacion", nota })
      .then((d) => refrescar(d, "Lista de documentos enviada al cliente."))
      .catch((er) => mensaje("mensaje-ficha", er.message, "error"));
  }

  function guardarPestana() {
    const recolectar = { resumen: recogerResumen, documentacion: recogerDocumentacion, judicial: recogerJudicial, acreedores: recogerAcreedores }[S.pestana];
    if (!recolectar) return marcarSucio(false);
    let cambios;
    try { cambios = recolectar(); } catch (er) { return mensaje("mensaje-ficha", er.message, "error"); }
    const b = $("btn-guardar");
    b.disabled = true;
    api({ accion: "actualizar", id: S.actual.id, cambios })
      .then((d) => refrescar(d, "Cambios guardados."))
      .catch((er) => { mensaje("mensaje-ficha", er.message, "error"); b.disabled = false; window.scrollTo(0, 0); });
  }

  /* ---------------- pestaña: resumen ---------------- */

  function formularioTest(r) {
    return M.PREGUNTAS.map((p) => {
      const v = r[p.id];
      if (p.multiple) {
        return `<div class="campo ancho"><span class="etiqueta">${esc(p.titulo)}</span><div class="botonera">${p.opciones.map((o) =>
          `<label class="casilla-linea" style="margin:0 .75rem .25rem 0"><input type="checkbox" data-test="${p.id}" value="${esc(o.valor)}"${(v || []).includes(o.valor) ? " checked" : ""}> ${esc(o.texto)}</label>`).join("")}</div></div>`;
      }
      return `<div class="campo"><label for="t-${p.id}">${esc(p.titulo)}${p.si ? " (si procede)" : ""}</label><select id="t-${p.id}" data-test="${p.id}">${opciones([["", "—"]].concat(p.opciones.map((o) => [o.valor, o.texto])), v)}</select></div>`;
    }).join("");
  }

  function pestanaResumen(cont) {
    const e = S.actual, r = e.resultado, c = e.cliente || {}, o = e.origen || {};
    const respuestas = e.respuestas || {};
    const filasRespuestas = M.PREGUNTAS.filter((p) => respuestas[p.id] !== undefined).map((p) => {
      const v = [].concat(respuestas[p.id]).map((x) => (p.opciones.find((op2) => op2.valor === x) || {}).texto || x).join(", ");
      return `<tr><td>${esc(p.titulo)}</td><td>${esc(v)}</td></tr>`;
    }).join("");
    const tieneTarjetas = (respuestas.tipos || []).includes("tarjetas");
    const k = e.calculadora;
    const ESTADO_CALC = { si: ["Se cancela", "m-verde"], parcial: ["En parte", "m-ambar"], no: ["No se cancela", "m-rojo"] };
    const cajaCalculo = k ? `<div class="caja">
          <div class="caja-cabeza"><div><span class="rotulo">Calculadora de la web · lo que declaró</span>
            <h2>${euros(k.cancelable)} cancelables de ${euros(k.total)} (${k.porcentaje} %)</h2></div></div>
          <div class="tabla-scroll"><table><thead><tr><th>Deuda</th><th class="der">Importe</th><th class="der">Cancelable</th><th>Estado</th></tr></thead><tbody>
            ${(k.lineas || []).map((l) => `<tr><td>${esc(l.nombre)}${l.motivo ? `<br><span class="tenue">${esc(l.motivo)}</span>` : ""}</td><td class="num der">${euros(l.total)}</td><td class="num der">${euros(l.cancelable)}</td><td>${marca(ESTADO_CALC[l.estado])}</td></tr>`).join("")}
          </tbody></table></div>
          ${k.datos && k.datos.embargoMensual ? `<p class="apunte" style="margin:.75rem 0 0">Le embargan ${euros(k.datos.embargoMensual)} al mes: seis meses de espera le cuestan unos ${euros(k.perdidaEspera)}.</p>` : ""}
          <p class="apunte" style="margin:.5rem 0 0">Cifras declaradas por el cliente y calculadas con la regla del art. 489 TRLC; compruébelas con los certificados de deuda.</p>
        </div>` : "";
    const cajaUrgente = e.urgente ? `<div class="aviso aviso-urgente"><b>⚡ Vía urgente · ${esc(e.urgente.texto || URGENCIA[e.urgente.tipo] || "Urgente")}</b>Entró el ${fh(e.urgente.fecha || e.creado)} pidiendo llamada prioritaria. Compruebe en la primera llamada fechas de embargo, señalamientos o subasta: si hay prisa, conviene presentar cuanto antes la solicitud para que el juzgado paralice las ejecuciones.</div>` : "";
    cont.innerHTML = `${cajaUrgente}<div class="dos-col">
      <div>
        ${cajaCalculo}
        <div class="caja">
          <div class="caja-cabeza"><div><span class="rotulo">Test de viabilidad</span><h2>${r ? esc(r.titulo) : "Sin test"}</h2></div>
            <button class="secundario mini" id="btn-test">${r ? "Corregir respuestas" : "Rellenar el test con el cliente"}</button></div>
          ${r ? `<p class="apunte">${esc(r.viaTitulo)} · ${euros(r.deudaEstimada)} aprox. · ${r.puntuacion}/100 · honorarios de referencia ${euros(r.honorariosEstimados)}</p>
            <ul class="puntos">${r.puntos.map((x) => `<li class="${x.tipo}">${esc(x.texto)}</li>`).join("")}</ul>` : '<p class="apunte">Alta manual. Rellene el test mientras habla con el cliente para obtener la vía, la documentación que necesita y la previsión de honorarios.</p>'}
          ${tieneTarjetas ? '<div class="aviso"><b>Tiene tarjetas</b>Valore también si alguna es revolving reclamable: puede reducir la deuda o devolver dinero. <a href="/admin/revolving">Abrir el panel de revolving</a>.</div>' : ""}
          <div id="zona-test" class="oculto" style="margin-top:1rem"><div class="rejilla">${formularioTest(respuestas)}</div>
            <p class="apunte">Al guardar se recalculan el resultado, la vía y la documentación.</p></div>
          ${filasRespuestas ? `<details class="detalle"><summary>Respuestas del test</summary><table class="respuestas" style="margin-top:.5rem"><tbody>${filasRespuestas}</tbody></table></details>` : ""}
        </div>
        <div class="caja">
          <span class="rotulo">Notas internas</span>
          <textarea id="r-notas" rows="5" placeholder="Situación familiar, acreedores que llaman, lo hablado en la consulta…">${esc(e.notas || "")}</textarea>
          ${c.observaciones ? `<p class="apunte" style="margin:.75rem 0 0"><b>Lo que nos contó en la web:</b> ${esc(c.observaciones)}</p>` : ""}
        </div>
      </div>
      <div>
        <div class="caja">
          <span class="rotulo">Seguimiento</span>
          <div class="rejilla">
            <div class="campo"><label for="r-seguimiento">Próximo seguimiento</label><input type="date" id="r-seguimiento" value="${esc(e.proximoSeguimiento || "")}"></div>
            <div class="campo"><label for="r-cita">Consulta gratuita</label><input type="datetime-local" id="r-cita" value="${esc(e.cita || "")}"></div>
          </div>
          ${e.fase === "descartado" && e.motivoDescarte ? `<p class="apunte">Descartado: ${esc(e.motivoDescarte)}</p>` : ""}
          <p class="apunte" style="margin:0">Primer contacto: ${e.primerContacto ? fh(e.primerContacto) + " (" + esc(minutosHasta(e.creado, e.primerContacto)) + " después de entrar)" : "pendiente"}</p>
        </div>
        <div class="caja">
          <span class="rotulo">Datos de contacto</span>
          <div class="rejilla">
            <div class="campo"><label for="r-nombre">Nombre</label><input id="r-nombre" value="${esc(c.nombre || "")}"></div>
            <div class="campo"><label for="r-telefono">Teléfono</label><input id="r-telefono" type="tel" value="${esc(c.telefono || "")}"></div>
            <div class="campo"><label for="r-email">Correo</label><input id="r-email" type="email" value="${esc(c.email || "")}"></div>
            <div class="campo"><label for="r-provincia">Provincia</label><select id="r-provincia"><option value="">Sin indicar</option>${opciones(M.PROVINCIAS.map((p) => [p, p]), c.provincia)}</select></div>
            <div class="campo"><label for="r-canal">Prefiere</label><select id="r-canal">${opciones([["llamada", "Llamada"], ["whatsapp", "WhatsApp"], ["email", "Correo"]], c.canal)}</select></div>
            <div class="campo"><label for="r-franja">Horario</label><select id="r-franja">${opciones([["indiferente", "Indiferente"], ["manana", "Mañanas"], ["tarde", "Tardes"]], c.franja)}</select></div>
          </div>
          <label class="casilla-linea"><input type="checkbox" id="r-comercial"${e.comercial ? " checked" : ""}> Acepta recibir información comercial</label>
        </div>
        <div class="caja">
          <span class="rotulo">Origen</span>
          <p class="apunte" style="margin:0">${esc(S.fuentes[o.fuente] || o.fuente || "Directo")}${o.campana ? " · campaña " + esc(o.campana) : ""}${o.entrada ? " · entró por " + esc(o.entrada) : ""}${o.pagina && o.pagina !== o.entrada ? " · envió desde " + esc(o.pagina) : ""}${o.gclid ? " · clic de Google Ads" : ""}${o.fbclid ? " · clic de Meta" : ""}</p>
          ${e.consentimiento ? `<p class="apunte" style="margin:.4rem 0 0">Consentimiento de privacidad: ${fh(e.consentimiento.fecha)} (${esc(e.consentimiento.textoVersion || "")})</p>` : ""}
        </div>
      </div></div>`;
    $("btn-test").addEventListener("click", () => { $("zona-test").classList.toggle("oculto"); });
  }

  function minutosHasta(desde, hasta) {
    const min = Math.round((Date.parse(hasta) - Date.parse(desde)) / 60000);
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.round(min / 60)} h`;
    return `${Math.round(min / 1440)} días`;
  }

  function recogerResumen() {
    const cambios = {
      notas: $("r-notas").value,
      proximoSeguimiento: valor("r-seguimiento"),
      cita: valor("r-cita"),
      comercial: $("r-comercial").checked,
      cliente: {
        nombre: valor("r-nombre"), telefono: valor("r-telefono"), email: valor("r-email"),
        provincia: valor("r-provincia"), canal: valor("r-canal"), franja: valor("r-franja")
      }
    };
    if (!cambios.cliente.nombre) throw new Error("El nombre no puede quedar vacío.");
    if (!$("zona-test").classList.contains("oculto")) {
      const r = {};
      M.PREGUNTAS.forEach((p) => {
        if (p.multiple) {
          const v = Array.from(vista.querySelectorAll(`input[data-test="${p.id}"]:checked`)).map((x) => x.value);
          if (v.length) r[p.id] = v;
        } else {
          const v = valor("t-" + p.id);
          if (v) r[p.id] = v;
        }
      });
      M.PREGUNTAS.forEach((p) => { if (p.si && !p.si(r)) delete r[p.id]; });
      if (!M.validarRespuestas(r)) throw new Error("Faltan respuestas del test: complete todas las preguntas que correspondan (las de casillas, al menos una opción).");
      cambios.respuestas = r;
    }
    return cambios;
  }

  /* ---------------- pestaña: documentación y honorarios ---------------- */

  function documentosDe(e) {
    return e.respuestas ? M.documentosRequeridos(Object.assign({ tipos: [], bienes: [] }, e.respuestas)) : M.DOCUMENTOS.filter((d) => !d.si);
  }

  function pestanaDocumentacion(cont) {
    const e = S.actual;
    const docs = documentosDe(e);
    const estados = e.documentos || {};
    const ok = docs.filter((d) => ["recibido", "validado"].includes((estados[d.id] || {}).estado)).length;
    const h = e.honorarios || { importe: 0 };
    cont.innerHTML = `<div class="dos-col">
      <div class="caja">
        <div class="caja-cabeza"><div><span class="rotulo">Documentación</span><h2>${ok} de ${docs.length} documentos</h2></div>
          ${e.cliente && e.cliente.email ? '<button class="secundario mini" id="btn-lista-docs-2" data-sin-cambios>Enviar al cliente lo que falta</button>' : ""}</div>
        <div class="progreso"><i style="width:${docs.length ? Math.round((ok / docs.length) * 100) : 0}%"></i></div>
        <ul class="docs-lista">${docs.map((d) => {
          const s = estados[d.id] || {};
          return `<li><div><b>${esc(d.nombre)}</b><small>${esc(d.comoConseguirlo)}</small></div>
            <select data-doc="${d.id}" aria-label="Estado de ${esc(d.nombre)}">${opciones([["pendiente", "Pendiente"], ["recibido", "Recibido"], ["validado", "Validado"], ["rechazado", "Hay que repetirlo"]], s.estado || "pendiente")}</select>
            <input data-doc-nota="${d.id}" placeholder="Nota (p. ej. «está caducado», «falta la 2.ª página»)" value="${esc(s.nota || "")}"></li>`;
        }).join("")}</ul>
        <p class="apunte" style="margin:.75rem 0 0">Los documentos «Hay que repetirlo» se incluyen en el correo al cliente con la nota.</p>
      </div>
      <div class="caja">
        <span class="rotulo">Honorarios</span>
        <div class="rejilla">
          <div class="campo"><label for="h-importe">Honorarios pactados (€)</label><input type="number" id="h-importe" min="0" step="50" value="${esc(h.importe || "")}"></div>
        </div>
        <div class="formulario-inline" data-sin-cambios>
          <span class="etiqueta">Generar plan de cuotas</span>
          <div class="rejilla">
            <div class="campo"><label for="h-n">Número de cuotas</label><input type="number" id="h-n" min="1" max="60" value="12"></div>
            <div class="campo"><label for="h-primera">Primera cuota</label><input type="date" id="h-primera" value="${esc(S.hoy)}"></div>
          </div>
          <button class="secundario mini" id="btn-cuotas">Generar cuotas mensuales</button>
        </div>
        <div class="tabla-scroll"><table class="pagos"><thead><tr><th>Concepto</th><th>Importe</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody id="filas-pagos"></tbody></table></div>
        <div class="botonera" style="margin-top:.6rem"><button class="secundario mini" id="btn-pago">+ Añadir pago</button></div>
        <p class="apunte" id="resumen-pagos" style="margin:.75rem 0 0"></p>
      </div></div>`;
    pintarPagos();
    if ($("btn-lista-docs-2")) $("btn-lista-docs-2").addEventListener("click", () => {
      if (S.sucio && !confirm("Guarde antes los cambios de la documentación para que el correo los tenga en cuenta. ¿Enviar de todos modos?")) return;
      enviarListaDocumentos();
    });
    $("btn-cuotas").addEventListener("click", () => {
      const total = Number($("h-importe").value) || 0;
      const n = Math.max(1, Math.min(60, parseInt($("h-n").value, 10) || 1));
      const primera = valor("h-primera") || S.hoy;
      if (!total) return alert("Indique primero el importe de los honorarios.");
      if (S.trabajo.pagos.length && !confirm("Se sustituirán los pagos actuales por el nuevo plan. ¿Continuar?")) return;
      const base = Math.floor((total / n) * 100) / 100;
      const [y, m, d] = primera.split("-").map(Number);
      S.trabajo.pagos = Array.from({ length: n }, (_, i) => {
        const f = new Date(Date.UTC(y, m - 1 + i, 1));
        const ultimo = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate();
        f.setUTCDate(Math.min(d, ultimo));
        return { id: nuevoId(), concepto: `Cuota ${i + 1} de ${n}`, importe: i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base, vence: f.toISOString().slice(0, 10), estado: "pendiente" };
      });
      pintarPagos();
      marcarSucio(true);
    });
    $("btn-pago").addEventListener("click", () => {
      S.trabajo.pagos.push({ id: nuevoId(), concepto: "Pago", importe: 0, vence: S.hoy, estado: "pendiente" });
      pintarPagos();
      marcarSucio(true);
    });
  }

  function pintarPagos() {
    const filas = $("filas-pagos");
    if (!filas) return;
    filas.innerHTML = S.trabajo.pagos.map((p, i) => `<tr>
      <td><input data-pago="${i}" data-k="concepto" value="${esc(p.concepto)}"></td>
      <td style="width:7.5rem"><input data-pago="${i}" data-k="importe" type="number" step="0.01" min="0" value="${esc(p.importe)}"></td>
      <td style="width:9.5rem"><input data-pago="${i}" data-k="vence" type="date" value="${esc(p.vence)}"></td>
      <td style="width:8.5rem"><select data-pago="${i}" data-k="estado">${opciones([["pendiente", "Pendiente"], ["pagado", "Pagado"], ["fallido", "Devuelto"]], p.estado)}</select></td>
      <td style="width:2rem"><button class="enlace" data-quitar-pago="${i}" aria-label="Quitar">×</button></td></tr>`).join("") ||
      '<tr><td colspan="5" class="tenue">Sin pagos registrados.</td></tr>';
    const cobrado = S.trabajo.pagos.filter((p) => p.estado === "pagado").reduce((s, p) => s + (Number(p.importe) || 0), 0);
    const pendiente = S.trabajo.pagos.filter((p) => p.estado !== "pagado").reduce((s, p) => s + (Number(p.importe) || 0), 0);
    const vencidas = S.trabajo.pagos.filter((p) => p.estado !== "pagado" && p.vence && p.vence < S.hoy).length;
    $("resumen-pagos").innerHTML = `Cobrado ${euros(cobrado)} · pendiente ${euros(pendiente)}${vencidas ? ` · <b style="color:var(--rojo)">${vencidas} vencida${vencidas === 1 ? "" : "s"}</b>` : ""}`;
    filas.oninput = filas.onchange = (ev) => {
      const el = ev.target.closest("[data-pago]");
      if (!el) return;
      const p = S.trabajo.pagos[Number(el.getAttribute("data-pago"))];
      const k = el.getAttribute("data-k");
      p[k] = k === "importe" ? Number(el.value) || 0 : el.value;
      if (k === "estado" && el.value === "pagado" && !p.pagadoEn) p.pagadoEn = S.hoy;
      if (ev.type === "change") pintarPagos();
    };
    filas.onclick = (ev) => {
      const b = ev.target.closest("[data-quitar-pago]");
      if (!b) return;
      S.trabajo.pagos.splice(Number(b.getAttribute("data-quitar-pago")), 1);
      pintarPagos();
      marcarSucio(true);
    };
  }

  function recogerDocumentacion() {
    const documentos = {};
    vista.querySelectorAll("select[data-doc]").forEach((s) => {
      const id = s.getAttribute("data-doc");
      const previo = (S.actual.documentos || {})[id] || {};
      const nota = (vista.querySelector(`input[data-doc-nota="${id}"]`) || {}).value || "";
      if (s.value === "pendiente" && !nota) return;
      documentos[id] = { estado: s.value, nota, fecha: previo.estado === s.value && previo.fecha ? previo.fecha : S.hoy };
    });
    return { documentos, honorarios: { importe: Number($("h-importe").value) || 0, pagos: S.trabajo.pagos } };
  }

  /* ---------------- pestaña: expediente judicial ---------------- */

  const CAMPOS_PERSONALES = [
    ["tratamiento", "Tratamiento", "select", [["", "—"], ["D.", "D."], ["D.ª", "D.ª"]]],
    ["dni", "DNI / NIE"],
    ["fechaNacimiento", "Fecha de nacimiento", "date"],
    ["domicilio", "Domicilio (calle y número)"],
    ["codigoPostal", "Código postal"],
    ["municipio", "Municipio"],
    ["estadoCivil", "Estado civil", "select", [["", "—"], ["soltero", "Soltero/a"], ["casado", "Casado/a"], ["pareja", "Pareja de hecho"], ["divorciado", "Divorciado/a"], ["viudo", "Viudo/a"]]],
    ["regimen", "Régimen económico", "select", [["", "—"], ["gananciales", "Gananciales"], ["separacion", "Separación de bienes"], ["participacion", "Participación"], ["otro", "Otro"]]],
    ["conyuge", "Cónyuge o pareja (nombre y DNI)"],
    ["fechaMatrimonio", "Fecha de matrimonio o inscripción", "date"],
    ["personasACargo", "Personas a cargo", "number"],
    ["situacionLaboral", "Situación laboral"],
    ["ingresosMensuales", "Ingresos netos mensuales (€)", "number"],
    ["gastosMensuales", "Gastos necesarios mensuales (€)", "number"],
    ["cuotasMensuales", "Cuotas mensuales de sus deudas (€)", "number"]
  ];
  const HITOS = [
    ["presentacion", "Presentación de la solicitud", "Fecha de presentación en LexNET."],
    ["autoDeclaracion", "Auto de declaración de concurso", "Fecha de recepción en LexNET."],
    ["edictoBOE", "Publicación del edicto en el BOE", "Abre los 15 días de los acreedores (art. 37 ter.1 TRLC) y, después, los 10 para pedir la exoneración."],
    ["liquidacion", "Apertura de la liquidación", ""],
    ["trasladoConclusion", "Traslado de la solicitud de conclusión", "Recepción en LexNET. Indique también los días de audiencia."],
    ["oposicionRecepcion", "Oposición a la exoneración (recepción)", "Recepción en LexNET. Contestación en 10 días (art. 536.3 TRLC)."],
    ["requerimientoRecepcion", "Requerimiento del juzgado (recepción)", "Recepción en LexNET. Indique los días que concede."],
    ["planAprobado", "Aprobación del plan de pagos", ""],
    ["exoneracion", "Exoneración concedida", ""]
  ];

  function campo(prefijo, [k, etiqueta, tipo, ops], valorActual, ayuda) {
    const id = prefijo + k;
    const v = valorActual == null ? "" : valorActual;
    const control = tipo === "select"
      ? `<select id="${id}">${opciones(ops, v)}</select>`
      : `<input id="${id}" type="${tipo || "text"}"${tipo === "number" ? ' step="any" min="0"' : ""} value="${esc(v)}">`;
    return `<div class="campo"><label for="${id}">${esc(etiqueta)}</label>${control}${ayuda ? `<small>${esc(ayuda)}</small>` : ""}</div>`;
  }

  function pestanaJudicial(cont) {
    const e = S.actual;
    const j = e.judicial || E.judicialInicial(e);
    const h = j.hitos || {};
    const d = e.despacho || {};
    let necesarios = [];
    try { necesarios = E.escritosDelExpediente(e, new Date()).filter((n) => n.plazo); } catch (er) { necesarios = []; }
    cont.innerHTML = `
      ${!e.judicial ? '<div class="aviso"><b>Expediente judicial sin abrir</b>Se abre al pasar el contacto a «Contratado». Puede adelantar los datos y guardarlos ya.</div>' : ""}
      <div class="caja">
        <span class="rotulo">Datos personales del deudor</span>
        <div class="rejilla">${CAMPOS_PERSONALES.map((c) => campo("j-", c, j[c[0]])).join("")}
          <div class="campo ancho"><label for="j-causas">Causas de la insolvencia (para la memoria)</label><textarea id="j-causas" rows="4" placeholder="Pérdida del empleo en 2023, divorcio, cierre del negocio…">${esc(j.causas || "")}</textarea></div>
        </div>
      </div>
      <div class="caja">
        <span class="rotulo">Procedimiento</span>
        <div class="rejilla">
          ${campo("j-", ["via", "Vía", "select", [["sin_masa", "Concurso sin masa"], ["liquidacion", "Exoneración con liquidación"], ["plan_pagos", "Plan de pagos"], ["microempresa", "Procedimiento de microempresas"]]], j.via || (e.resultado && e.resultado.via) || "sin_masa")}
          ${campo("j-", ["sede", "Sede de la Sección de lo Mercantil"], j.sede, "Normalmente la capital de la provincia del domicilio (art. 45 TRLC).")}
          ${campo("j-", ["plaza", "Plaza n.º"], j.plaza)}
          ${campo("j-", ["autos", "Autos"], j.autos, "Por ejemplo, «Concurso de acreedores n.º 123/2026».")}
          ${campo("j-", ["procurador", "Procurador/a"], j.procurador, d.procurador ? "Si lo deja vacío: " + d.procurador : "")}
        </div>
        <span class="rotulo" style="margin-top:.5rem">Letrado que firma</span>
        <div class="rejilla">
          ${campo("d-", ["letrado", "Letrado/a"], d.letrado)}
          ${campo("d-", ["colegiado", "N.º de colegiado"], d.colegiado)}
          ${campo("d-", ["colegio", "Colegio de la Abogacía de"], d.colegio)}
          ${campo("d-", ["procurador", "Procurador/a por defecto"], d.procurador)}
        </div>
      </div>
      <div class="caja">
        <span class="rotulo">Fechas procesales</span>
        <p class="apunte">De estas fechas salen los plazos y los avisos. En las notificaciones, indique el día de <b>recepción en LexNET</b>: se tienen por hechas al día siguiente (art. 151.2 LEC).</p>
        <div class="rejilla">
          ${HITOS.map(([k, t, a]) => campo("h-", [k, t, "date"], h[k], a)).join("")}
          ${campo("h-", ["diasAudienciaConclusion", "Días de audiencia de la conclusión", "number"], h.diasAudienciaConclusion)}
          ${campo("h-", ["requerimientoDias", "Días que concede el requerimiento", "number"], h.requerimientoDias)}
          ${campo("h-", ["oposicionAcreedor", "Acreedor que se opone"], h.oposicionAcreedor)}
          <div class="campo"><span class="etiqueta">Concurso sin masa</span><label class="casilla-linea"><input type="checkbox" id="h-sinMasa"${h.sinMasa ? " checked" : ""}> El auto declara el concurso sin masa</label></div>
          <div class="campo ancho"><label for="h-requerimientoTexto">Qué pide el requerimiento</label><textarea id="h-requerimientoTexto" rows="2">${esc(h.requerimientoTexto || "")}</textarea></div>
        </div>
      </div>
      <div class="caja">
        <span class="rotulo">Plazos calculados</span>
        ${necesarios.length ? necesarios.map((n) => {
          const p = n.plazo;
          const presentado = n.escrito && n.escrito.estado === "presentado";
          return `<div class="escrito-fila"><div><b>${esc(n.def.corto)}${n.etiqueta ? " · " + esc(n.etiqueta) : ""}</b>
            <p>${esc(p.base)} · ${p.dias} días hábiles desde el ${fc(p.inicio)} · vence el <b>${fc(p.vence)}</b> · gracia hasta las 15:00 del ${fc(p.gracia)}</p>
            <details class="detalle"><summary>Ver el cómputo día a día</summary><div class="computo">${p.detalle.map((x) => x.inhabil ? `<span class="inhabil" title="${esc(x.inhabil)}">${fc(x.fecha).slice(0, 5)}</span>` : `<span title="Día ${x.numero}">${fc(x.fecha).slice(0, 5)}</span>`).join("")}</div></details></div>
            <div>${presentado ? marca(ESTADO_ESCRITO.presentado) : chipPlazo({ vence: p.vence })}</div></div>`;
        }).join("") : '<p class="vacio">Sin plazos abiertos. Aparecerán al indicar las fechas de arriba y guardar.</p>'}
      </div>`;
  }

  function recogerJudicial() {
    const j = { hitos: {} };
    CAMPOS_PERSONALES.forEach(([k]) => { j[k] = valor("j-" + k); });
    ["via", "sede", "plaza", "autos", "procurador"].forEach((k) => { j[k] = valor("j-" + k); });
    j.causas = $("j-causas").value;
    HITOS.forEach(([k]) => { j.hitos[k] = valor("h-" + k); });
    ["diasAudienciaConclusion", "requerimientoDias", "oposicionAcreedor"].forEach((k) => { j.hitos[k] = valor("h-" + k); });
    j.hitos.requerimientoTexto = $("h-requerimientoTexto").value;
    j.hitos.sinMasa = $("h-sinMasa").checked ? true : undefined;
    if (j.hitos.requerimientoRecepcion && !j.hitos.requerimientoDias) throw new Error("Indique los días que concede el requerimiento para poder calcular el plazo.");
    return {
      judicial: j,
      despacho: { letrado: valor("d-letrado"), colegiado: valor("d-colegiado"), colegio: valor("d-colegio"), procurador: valor("d-procurador") }
    };
  }

  /* ---------------- pestaña: acreedores y bienes ---------------- */

  const TIPOS_BIEN = { vivienda: "Vivienda habitual", inmueble: "Otro inmueble", vehiculo: "Vehículo", cuenta: "Cuenta o depósito", otro: "Otro" };

  function pestanaAcreedores(cont) {
    const exPrevia = S.actual.respuestas && S.actual.respuestas.exoneracionPrevia === "si";
    const calc = M.calcularExoneracion(S.trabajo.acreedores, { exoneracionPrevia: exPrevia });
    const porId = {};
    calc.porAcreedor.forEach((x) => { porId[x.acreedor.id] = x; });
    const lista = M.ordenAlfabetico(S.trabajo.acreedores);
    cont.innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Pasivo total</small><b>${euros(calc.pasivo)}</b><span>${S.trabajo.acreedores.length} crédito${S.trabajo.acreedores.length === 1 ? "" : "s"}</span></div>
        <div class="kpi"><small>Exonerable</small><b style="color:var(--verde)">${euros(calc.exonerable)}</b><span>${calc.pasivo ? Math.round((calc.exonerable / calc.pasivo) * 100) : 0} % del pasivo</span></div>
        <div class="kpi"><small>No exonerable</small><b>${euros(calc.noExonerable)}</b><span>garantías, límites y alimentos</span></div>
        <div class="kpi"><small>Crédito público</small><b>${euros(calc.porClase.publico.importe)}</b><span>${calc.publicos.length} ${calc.publicos.length === 1 ? "administración" : "administraciones"}</span></div>
      </div>
      ${exPrevia ? '<div class="aviso mal"><b>Exoneración previa</b>El crédito público no es exonerable en una segunda exoneración (art. 489.3 TRLC).</div>' : ""}
      <div class="caja">
        <div class="caja-cabeza"><div><span class="rotulo">Relación de acreedores</span><h2>Por orden alfabético, como exige el art. 7 TRLC</h2></div><button class="secundario mini" id="btn-acreedor" data-sin-cambios>+ Añadir acreedor</button></div>
        <div id="form-acreedor"></div>
        ${lista.length ? `<div class="tabla-scroll"><table><thead><tr><th>Acreedor</th><th>Concepto</th><th class="der">Total</th><th class="der">Exonerable</th><th>Observaciones</th><th></th></tr></thead><tbody>
          ${lista.map((a) => {
            const c = porId[a.id] || {};
            return `<tr><td><b>${esc(a.nombre)}</b><br><span class="tenue">${esc(M.TIPOS_ACREEDOR[a.tipo] || a.tipo)}${a.nif ? " · " + esc(a.nif) : ""}</span>${a.domicilio ? "" : '<br><span class="tenue" style="color:var(--ambar)">Falta el domicilio</span>'}</td>
              <td>${esc(a.concepto)}${a.procedimiento ? `<br><span class="tenue">${esc(a.procedimiento.autos)}: ${esc(a.procedimiento.estado || "")}</span>` : ""}</td>
              <td class="num der">${euros(c.total)}${a.accesorios ? `<br><span class="tenue">+${euros(a.accesorios)} rec.</span>` : ""}</td>
              <td class="num der"><b>${euros(c.exonerable)}</b></td>
              <td class="tenue">${esc(c.motivo || (M.esPublico(a) ? "Dentro del límite" : "—"))}</td>
              <td class="der" style="white-space:nowrap"><button class="enlace" data-editar-acreedor="${esc(a.id)}">Editar</button> · <button class="enlace" data-quitar-acreedor="${esc(a.id)}" style="color:var(--rojo)">Quitar</button></td></tr>`;
          }).join("")}</tbody></table></div>` : '<p class="vacio">Sin acreedores. Contrástelos con la CIRBE y con los certificados de la Agencia Tributaria y de la Seguridad Social.</p>'}
        ${calc.publicos.length ? `<p class="apunte" style="margin:.85rem 0 0">Crédito público por acreedor (STS 264/2026): ${calc.publicos.map((p) => `${esc(p.nombre)}: principal ${euros(p.principal)} → exonerable ${euros(p.exonerable)}${p.subordinado ? ` + ${euros(p.subordinado)} de recargos` : ""}`).join(" · ")}.</p>` : ""}
      </div>
      <div class="caja">
        <div class="caja-cabeza"><div><span class="rotulo">Inventario de bienes y derechos</span><h2>${S.trabajo.bienes.length ? euros(S.trabajo.bienes.reduce((s, b) => s + (Number(b.valorActual) || 0), 0)) + " de valor estimado" : "Sin bienes"}</h2></div><button class="secundario mini" id="btn-bien" data-sin-cambios>+ Añadir bien</button></div>
        <div id="form-bien"></div>
        ${S.trabajo.bienes.length ? `<ul class="lista-atencion">${S.trabajo.bienes.map((b) => `<li style="cursor:default"><div><b>${esc(b.descripcion)}</b>${b.necesario ? ' <span class="marca m-tinta">Necesario para su actividad</span>' : ""}<p>${esc(TIPOS_BIEN[b.tipo] || b.tipo)}${b.identificacion ? " · " + esc(b.identificacion) : ""}${b.cargas ? " · " + esc(b.cargas) : ""}</p></div>
          <div class="der"><span class="num">${b.valorActual != null && b.valorActual !== "" ? euros(b.valorActual) : "—"}</span><br><button class="enlace" data-editar-bien="${esc(b.id)}">Editar</button> · <button class="enlace" data-quitar-bien="${esc(b.id)}" style="color:var(--rojo)">Quitar</button></div></li>`).join("")}</ul>`
          : '<p class="vacio">Sin bienes. El inventario dirá que no es titular de bienes de valor realizable.</p>'}
      </div>`;
    $("btn-acreedor").addEventListener("click", () => formAcreedor(null));
    $("btn-bien").addEventListener("click", () => formBien(null));
    cont.querySelectorAll("[data-editar-acreedor]").forEach((b) => b.addEventListener("click", () => formAcreedor(b.getAttribute("data-editar-acreedor"))));
    cont.querySelectorAll("[data-quitar-acreedor]").forEach((b) => b.addEventListener("click", () => {
      const a = S.trabajo.acreedores.find((x) => x.id === b.getAttribute("data-quitar-acreedor"));
      if (!a || !confirm(`¿Quitar a ${a.nombre} de la relación de acreedores?`)) return;
      S.trabajo.acreedores = S.trabajo.acreedores.filter((x) => x !== a);
      pestanaAcreedores(cont);
      marcarSucio(true);
    }));
    cont.querySelectorAll("[data-editar-bien]").forEach((b) => b.addEventListener("click", () => formBien(b.getAttribute("data-editar-bien"))));
    cont.querySelectorAll("[data-quitar-bien]").forEach((b) => b.addEventListener("click", () => {
      const x = S.trabajo.bienes.find((y) => y.id === b.getAttribute("data-quitar-bien"));
      if (!x || !confirm(`¿Quitar «${x.descripcion}» del inventario?`)) return;
      S.trabajo.bienes = S.trabajo.bienes.filter((y) => y !== x);
      pestanaAcreedores(cont);
      marcarSucio(true);
    }));
  }

  function formAcreedor(id) {
    const a = S.trabajo.acreedores.find((x) => x.id === id) || { tipo: "banco", garantia: "ninguna" };
    const p = a.procedimiento || {};
    const caja = $("form-acreedor");
    caja.innerHTML = `<div class="formulario-inline" data-sin-cambios>
      <span class="etiqueta">${id ? "Editar acreedor" : "Nuevo acreedor"}</span>
      <div class="rejilla">
        ${campo("a-", ["nombre", "Nombre o razón social"], a.nombre)}
        ${campo("a-", ["nif", "NIF"], a.nif)}
        ${campo("a-", ["tipo", "Tipo", "select", Object.keys(M.TIPOS_ACREEDOR).map((k) => [k, M.TIPOS_ACREEDOR[k]])], a.tipo)}
        ${campo("a-", ["domicilio", "Domicilio (obligatorio, art. 7 TRLC)"], a.domicilio)}
        ${campo("a-", ["email", "Correo electrónico"], a.email)}
        ${campo("a-", ["concepto", "Concepto"], a.concepto, "Tarjeta, préstamo personal, IRPF 2023…")}
        ${campo("a-", ["principal", "Principal (€)", "number"], a.principal)}
        ${campo("a-", ["accesorios", "Recargos, intereses y sanciones (€)", "number"], a.accesorios, "Créditos subordinados: exonerables íntegramente.")}
        ${campo("a-", ["vencimiento", "Vencimiento", "date"], a.vencimiento)}
        ${campo("a-", ["garantia", "Garantía", "select", [["ninguna", "Ninguna"], ["hipoteca", "Hipoteca"], ["prenda", "Prenda"], ["aval", "Aval de un tercero"]]], a.garantia)}
        ${campo("a-", ["importeGarantizado", "Parte cubierta por la garantía (€)", "number"], a.importeGarantizado)}
        ${campo("a-", ["noExonerable", "No exonerable por su naturaleza (motivo)"], a.noExonerable, "Por ejemplo, «Pensión de alimentos». Vacío si es exonerable.")}
      </div>
      <label class="casilla-linea"><input type="checkbox" id="a-conproc"${a.procedimiento ? " checked" : ""}> Hay un procedimiento judicial o un embargo en curso</label>
      <div class="rejilla${a.procedimiento ? "" : " oculto"}" id="a-proc">
        ${campo("a-", ["organo", "Órgano judicial"], p.organo)}
        ${campo("a-", ["autos", "Autos"], p.autos)}
        ${campo("a-", ["estado", "Estado (embargo de nómina, subasta…)"], p.estado)}
      </div>
      <div class="botonera"><button class="mini" id="a-guardar">${id ? "Aplicar cambios" : "Añadir a la relación"}</button><button class="secundario mini" id="a-cancelar">Cancelar</button></div>
    </div>`;
    $("a-nombre").focus();
    $("a-conproc").addEventListener("change", function () { $("a-proc").classList.toggle("oculto", !this.checked); });
    $("a-cancelar").addEventListener("click", () => { caja.innerHTML = ""; });
    $("a-guardar").addEventListener("click", () => {
      const num = (k) => (valor("a-" + k) === "" ? undefined : Number(valor("a-" + k)));
      if (!valor("a-nombre")) return alert("Indique el nombre del acreedor.");
      if (!(num("principal") >= 0)) return alert("Indique el principal adeudado.");
      const nuevo = {
        id: a.id || nuevoId(), nombre: valor("a-nombre"), nif: valor("a-nif") || undefined, tipo: valor("a-tipo"),
        domicilio: valor("a-domicilio") || undefined, email: valor("a-email") || undefined, concepto: valor("a-concepto") || "Deuda",
        principal: num("principal") || 0, accesorios: num("accesorios"), vencimiento: valor("a-vencimiento") || undefined,
        garantia: valor("a-garantia"), importeGarantizado: num("importeGarantizado"), noExonerable: valor("a-noExonerable") || undefined,
        procedimiento: $("a-conproc").checked ? { organo: valor("a-organo"), autos: valor("a-autos"), estado: valor("a-estado") } : undefined
      };
      if (nuevo.procedimiento && !nuevo.procedimiento.autos && !nuevo.procedimiento.organo) return alert("Indique al menos el órgano o los autos del procedimiento.");
      const i = S.trabajo.acreedores.findIndex((x) => x.id === nuevo.id);
      if (i === -1) S.trabajo.acreedores.push(nuevo); else S.trabajo.acreedores[i] = nuevo;
      pestanaAcreedores($("contenido-ficha"));
      marcarSucio(true);
    });
  }

  function formBien(id) {
    const b = S.trabajo.bienes.find((x) => x.id === id) || { tipo: "vehiculo" };
    const caja = $("form-bien");
    caja.innerHTML = `<div class="formulario-inline" data-sin-cambios>
      <span class="etiqueta">${id ? "Editar bien" : "Nuevo bien"}</span>
      <div class="rejilla">
        ${campo("b-", ["tipo", "Tipo", "select", Object.keys(TIPOS_BIEN).map((k) => [k, TIPOS_BIEN[k]])], b.tipo)}
        ${campo("b-", ["descripcion", "Descripción"], b.descripcion, "Turismo marca y modelo, piso en calle…, cuenta en…")}
        ${campo("b-", ["identificacion", "Identificación"], b.identificacion, "Matrícula, finca registral, IBAN…")}
        ${campo("b-", ["valorAdquisicion", "Valor de adquisición (€)", "number"], b.valorAdquisicion)}
        ${campo("b-", ["valorActual", "Valor actual (€)", "number"], b.valorActual)}
        ${campo("b-", ["cargas", "Cargas"], b.cargas, "Hipoteca, reserva de dominio, embargo…")}
      </div>
      <label class="casilla-linea"><input type="checkbox" id="b-necesario"${b.necesario ? " checked" : ""}> Necesario para su actividad profesional</label>
      <div class="botonera"><button class="mini" id="b-guardar">${id ? "Aplicar cambios" : "Añadir al inventario"}</button><button class="secundario mini" id="b-cancelar">Cancelar</button></div>
    </div>`;
    $("b-descripcion").focus();
    $("b-cancelar").addEventListener("click", () => { caja.innerHTML = ""; });
    $("b-guardar").addEventListener("click", () => {
      if (!valor("b-descripcion")) return alert("Describa el bien.");
      const num = (k) => (valor("b-" + k) === "" ? undefined : Number(valor("b-" + k)));
      const nuevo = {
        id: b.id || nuevoId(), tipo: valor("b-tipo"), descripcion: valor("b-descripcion"), identificacion: valor("b-identificacion") || undefined,
        valorAdquisicion: num("valorAdquisicion"), valorActual: num("valorActual"), cargas: valor("b-cargas") || undefined,
        necesario: $("b-necesario").checked || undefined
      };
      const i = S.trabajo.bienes.findIndex((x) => x.id === nuevo.id);
      if (i === -1) S.trabajo.bienes.push(nuevo); else S.trabajo.bienes[i] = nuevo;
      pestanaAcreedores($("contenido-ficha"));
      marcarSucio(true);
    });
  }

  function recogerAcreedores() {
    return { acreedores: S.trabajo.acreedores, bienes: S.trabajo.bienes };
  }

  /* ---------------- pestaña: escritos ---------------- */

  function pestanaEscritos(cont) {
    const e = S.actual;
    if (!E.esCliente(e)) {
      cont.innerHTML = `<div class="caja"><p class="vacio">Los escritos aparecen cuando el contacto pasa a cliente (fase «Contratado» o posterior). Mientras tanto puede ir completando el expediente judicial y los acreedores.</p></div>`;
      return;
    }
    let lista = [];
    try { lista = E.escritosDelExpediente(e, new Date()); } catch (er) {
      cont.innerHTML = `<div class="mensaje error">No se pudieron calcular los escritos: ${esc(er.message)}</div>`;
      return;
    }
    const grupos = Object.keys(E.GRUPOS).map((g) => [g, lista.filter((n) => n.def.grupo === g)]).filter(([, l]) => l.length);
    cont.innerHTML = `<div class="caja">${grupos.map(([g, l]) => `<div class="escritos-grupo"><span class="rotulo">${esc(E.GRUPOS[g])}</span>
      ${l.map((n) => {
        const estado = n.escrito ? n.escrito.estado : "pendiente";
        const destino = `escrito/${e.id}/${n.clave}`;
        return `<div class="escrito-fila"><div><b>${esc(n.def.corto)}${n.etiqueta ? " · " + esc(n.etiqueta) : ""}</b> ${marca(ESTADO_ESCRITO[estado])}
          <p>${esc(n.def.base)}${n.plazo ? ` · vence el ${fc(n.plazo.vence)} (gracia ${fc(n.plazo.gracia)})` : ""}${n.abreEl && n.abreEl > S.hoy ? ` · se puede presentar desde el ${fc(n.abreEl)}` : ""}${n.escrito ? ` · editado ${fh(n.escrito.actualizado)}` : ""}${n.escrito && n.escrito.justificante ? ` · justificante ${esc(n.escrito.justificante)}` : ""}</p>
          ${n.disponible !== true ? `<p style="color:var(--ambar)">${esc(n.disponible)}</p>` : ""}</div>
          <div class="botonera">${n.plazo && estado !== "presentado" ? chipPlazo({ vence: n.plazo.vence }) : ""}
            ${n.escrito ? `<button class="secundario mini" data-ir="${esc(destino)}">Abrir</button>` : n.disponible === true ? `<button class="mini" data-ir="${esc(destino)}">Redactar</button>` : ""}</div></div>`;
      }).join("")}</div>`).join("")}</div>
      <p class="apunte">Los borradores se generan con los datos del expediente, los acreedores y el letrado. Lo que falte queda resaltado como [[dato pendiente]] y el escrito no puede marcarse como revisado hasta completarlo.</p>`;
  }

  /* ---------------- pestaña: historial ---------------- */

  function pestanaHistorial(cont) {
    const h = (S.actual.historial || []).slice().reverse();
    cont.innerHTML = `<div class="caja">
      <div class="caja-cabeza"><span class="rotulo">Historial</span><button class="secundario mini" data-registro-h="nota|" data-sin-cambios>+ Añadir nota</button></div>
      <ul class="historial">${h.map((x) => `<li><span class="cuando">${esc(fh(x.fecha))}</span><span><b>${esc(x.quien)}</b> · ${esc(x.que)}</span></li>`).join("") || '<li class="vacio">Sin movimientos.</li>'}</ul></div>`;
    cont.querySelector("[data-registro-h]").addEventListener("click", () => { abrirRegistro("nota|"); window.scrollTo(0, 0); });
  }

  /* ================================================================== */
  /* Editor de escritos                                                  */
  /* ================================================================== */

  function enLineaHtml(t) {
    return E.enLinea(t).map((x) => {
      let h = esc(x.texto);
      if (x.pendiente) h = `<mark title="Dato pendiente">${h}</mark>`;
      if (x.cursiva) h = `<em>${h}</em>`;
      if (x.negrita) h = `<strong>${h}</strong>`;
      return h;
    }).join("");
  }

  function pintarHoja(texto) {
    return E.analizar(texto).map((b) => {
      switch (b.t) {
        case "titulo": return `<h3>${enLineaHtml(b.texto)}</h3>`;
        case "apartado": return `<h4>${enLineaHtml(b.texto)}</h4>`;
        case "cita": return `<blockquote>${enLineaHtml(b.texto)}</blockquote>`;
        case "derecha": return `<p class="derecha">${enLineaHtml(b.texto)}</p>`;
        case "lista": return `<ul>${b.items.map((i) => `<li>${enLineaHtml(i)}</li>`).join("")}</ul>`;
        case "tabla": return `<div class="tabla-scroll"><table>${b.filas.map((f, r) => `<tr>${f.map((c) => (b.cabecera && r === 0 ? `<th>${enLineaHtml(c)}</th>` : `<td>${enLineaHtml(c)}</td>`)).join("")}</tr>`).join("")}</table></div>`;
        default: return `<p>${enLineaHtml(b.texto)}</p>`;
      }
    }).join("");
  }

  function abrirEditor(id, clave) {
    vista.innerHTML = '<p class="apunte">Abriendo el escrito…</p>';
    const tipo = clave.split("|")[0];
    const refId = clave.split("|")[1] || undefined;
    const def = E.definicion(tipo);
    if (!def) { vista.innerHTML = '<div class="mensaje error">Tipo de escrito desconocido.</div>'; return; }
    const cargarExp = S.actual && S.actual.id === id ? Promise.resolve() : api({ accion: "abrir", id }).then((d) => { S.actual = d.expediente; });
    cargarExp
      .then(() => api({ accion: "escrito", id, clave }))
      .then((d) => {
        let contenido = d.contenido;
        let titulo = d.meta ? d.meta.titulo : "";
        let nuevo = false;
        if (!contenido) {
          const g = E.generarEscrito(tipo, S.actual, new Date(), refId);
          contenido = g.contenido;
          titulo = g.titulo;
          nuevo = true;
        }
        S.editor = { id, clave, tipo, refId, titulo, contenido, meta: d.meta, nuevo };
        pintarEditor();
        if (nuevo) marcarSucio(true);
      })
      .catch((e) => { vista.innerHTML = `<div class="mensaje error">${esc(e.message)}</div><p><a href="#${esc(id)}/escritos">Volver al expediente</a></p>`; });
  }

  function pintarEditor() {
    const ed = S.editor, e = S.actual, meta = ed.meta || {};
    const estado = meta.estado || "borrador";
    let necesario = null;
    try { necesario = E.escritosDelExpediente(e, new Date()).find((n) => n.clave === ed.clave) || null; } catch (er) { necesario = null; }
    const notas = E.notasEscrito(ed.tipo, e, new Date());
    vista.innerHTML = `
      <p style="margin:0 0 .75rem"><a href="#${esc(e.id)}/escritos">← ${esc(e.cliente.nombre)} · escritos</a></p>
      <div class="caja">
        <div class="caja-cabeza">
          <div><span class="rotulo">Escrito · ${esc(e.id)} · ${esc(E.definicion(ed.tipo).base)}</span><h1 style="margin:0">${esc(ed.titulo)}</h1>
            <div class="chips" style="margin-top:.5rem">${marca(ESTADO_ESCRITO[ed.nuevo ? "pendiente" : estado])}${ed.nuevo ? ' <span class="marca m-ambar">Sin guardar</span>' : ""}
            ${necesario && necesario.plazo && estado !== "presentado" ? `${chipPlazo({ vence: necesario.plazo.vence })} <span class="tenue">vence el ${fc(necesario.plazo.vence)} · gracia hasta las 15:00 del ${fc(necesario.plazo.gracia)}</span>` : ""}</div></div>
          <div class="botonera">
            <button id="ed-guardar">Guardar</button>
            <button class="secundario" id="ed-word">Descargar Word</button>
            <button class="secundario" id="ed-copiar">Copiar texto</button>
          </div>
        </div>
        ${ed.nuevo ? '<div class="aviso ok"><b>Borrador generado con los datos actuales del expediente</b>Revíselo y guárdelo para conservarlo. Hasta entonces no consta en el expediente.</div>' : ""}
        <div class="rejilla" style="margin-top:1rem;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
          <div class="campo"><label for="ed-estado">Estado</label><select id="ed-estado">${opciones([["borrador", "Borrador"], ["revisado", "Revisado por el letrado"], ["presentado", "Presentado en el juzgado"]], estado)}</select></div>
          <div class="campo ${estado === "presentado" ? "" : "oculto"}" data-presentado><label for="ed-fecha">Fecha de presentación</label><input type="date" id="ed-fecha" value="${esc(meta.presentadoEn || S.hoy)}"></div>
          <div class="campo ${estado === "presentado" ? "" : "oculto"}" data-presentado><label for="ed-justificante">Justificante LexNET</label><input id="ed-justificante" value="${esc(meta.justificante || "")}" placeholder="N.º de justificante"></div>
        </div>
        ${meta.revisadoPor ? `<p class="apunte" style="margin:0">Revisado por ${esc(meta.revisadoPor)} el ${fh(meta.revisadoEn)}</p>` : ""}
        <div id="ed-mensaje"></div>
      </div>
      <div class="botonera alternar" style="margin-bottom:.75rem" role="tablist">
        <button class="secundario mini" data-modo="hoja" aria-selected="true">Documento</button>
        <button class="secundario mini" data-modo="texto">Editar texto</button>
      </div>
      <div class="editor solo-hoja" id="ed-rejilla">
        <div class="columna-hoja"><article class="hoja" id="ed-hoja"></article></div>
        <div class="columna-texto editor-lateral">
          <div class="caja" style="margin:0">
            <span class="rotulo">Texto del escrito</span>
            <textarea id="e-texto" spellcheck="true" lang="es">${esc(ed.contenido)}</textarea>
            <p class="apunte" style="margin:.5rem 0 0"># título · ## apartado · &gt; cita · &gt;&gt; a la derecha · - lista · | tabla | · **negrita** · *cursiva* · [[dato pendiente]]</p>
            <div id="ed-huecos"></div>
            <div class="botonera" style="margin-top:.75rem"><button class="secundario mini" id="ed-regenerar">Regenerar con los datos actuales</button></div>
          </div>
          ${notas.length ? `<div class="caja" style="margin:0"><span class="rotulo">Notas para el letrado (no van en el escrito)</span><ul class="notas-letrado">${notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
        </div>
      </div>
      <div class="guardar-fijo${ed.nuevo ? "" : " oculto"}" id="barra-guardar"><span>Cambios sin guardar en el escrito.</span><div class="botonera"><button id="ed-guardar-2">Guardar</button></div></div>`;

    const ta = $("e-texto");
    let temporizador = null;
    const actualizarVista = () => {
      if (!$("ed-hoja") || !document.body.contains(ta)) return;
      $("ed-hoja").innerHTML = pintarHoja(ta.value);
      const huecos = E.pendientes(ta.value);
      $("ed-huecos").innerHTML = huecos.length
        ? `<p class="apunte" style="margin:.85rem 0 0;color:var(--ambar)"><b>${huecos.length} dato${huecos.length === 1 ? "" : "s"} por completar</b> (pulse para ir a cada uno):</p><ul class="huecos">${huecos.map((h) => `<li><button data-hueco="${esc(h)}">${esc(h)}</button></li>`).join("")}</ul>`
        : '<p class="apunte" style="margin:.85rem 0 0;color:var(--verde)">Sin datos pendientes.</p>';
    };
    actualizarVista();
    ta.addEventListener("input", () => {
      marcarSucio(true);
      clearTimeout(temporizador);
      temporizador = setTimeout(actualizarVista, 250);
    });
    $("ed-huecos").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-hueco]");
      if (!b) return;
      cambiarModo("texto");
      const buscado = "[[" + b.getAttribute("data-hueco") + "]]";
      const desde = ta.selectionEnd || 0;
      let i = ta.value.indexOf(buscado, desde);
      if (i === -1) i = ta.value.indexOf(buscado);
      if (i === -1) return;
      ta.focus();
      ta.setSelectionRange(i, i + buscado.length);
      const lineas = ta.value.slice(0, i).split("\n").length;
      ta.scrollTop = Math.max(0, (lineas - 3) * 20.8);
    });
    $("ed-estado").addEventListener("change", function () {
      vista.querySelectorAll("[data-presentado]").forEach((x) => x.classList.toggle("oculto", this.value !== "presentado"));
      marcarSucio(true);
    });
    ["ed-fecha", "ed-justificante"].forEach((k) => $(k).addEventListener("input", () => marcarSucio(true)));
    $("ed-guardar").addEventListener("click", guardarEscrito);
    $("ed-guardar-2").addEventListener("click", guardarEscrito);
    $("ed-copiar").addEventListener("click", function () {
      const texto = E.textoPlano(ta.value);
      const hecho = () => { this.textContent = "Copiado"; setTimeout(() => { this.textContent = "Copiar texto"; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(hecho, () => copiarAntiguo(texto, hecho));
      else copiarAntiguo(texto, hecho);
    });
    $("ed-word").addEventListener("click", function () {
      const b = this;
      b.disabled = true;
      mensaje("ed-mensaje", "Preparando el Word…");
      api({ accion: "word", titulo: ed.titulo, referencia: e.id, contenido: ta.value })
        .then((d) => {
          const bin = atob(d.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = d.nombre;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          mensaje("ed-mensaje", `Descargado: ${d.nombre}. Los datos pendientes van resaltados en amarillo.`);
        })
        .catch((er) => mensaje("ed-mensaje", er.message, "error"))
        .then(() => { b.disabled = false; });
    });
    $("ed-regenerar").addEventListener("click", () => {
      if (!confirm("Se sustituirá el texto por un borrador nuevo generado con los datos actuales del expediente. Perderá los cambios hechos a mano en este escrito. ¿Continuar?")) return;
      ta.value = E.generarEscrito(ed.tipo, S.actual, new Date(), ed.refId).contenido;
      actualizarVista();
      marcarSucio(true);
      mensaje("ed-mensaje", "Texto regenerado. Guarde para conservarlo.");
    });
    vista.querySelectorAll("[data-modo]").forEach((b) => b.addEventListener("click", () => cambiarModo(b.getAttribute("data-modo"))));
  }

  function cambiarModo(modo) {
    const r = $("ed-rejilla");
    if (!r) return;
    r.classList.toggle("solo-hoja", modo === "hoja");
    r.classList.toggle("solo-texto", modo === "texto");
    vista.querySelectorAll("[data-modo]").forEach((b) => b.setAttribute("aria-selected", String(b.getAttribute("data-modo") === modo)));
  }

  function copiarAntiguo(texto, hecho) {
    const ta = document.createElement("textarea");
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); hecho(); } catch (e) { /* nada */ }
    ta.remove();
  }

  function guardarEscrito() {
    const ed = S.editor;
    const estado = valor("ed-estado");
    const cuerpo = {
      accion: "guardarEscrito", id: ed.id, clave: ed.clave, tipo: ed.tipo, refId: ed.refId, titulo: ed.titulo,
      contenido: $("e-texto").value, estado, presentadoEn: valor("ed-fecha"), justificante: valor("ed-justificante")
    };
    if (estado === "presentado" && !cuerpo.justificante && !confirm("¿Marcar como presentado sin el número de justificante de LexNET?")) return;
    ["ed-guardar", "ed-guardar-2"].forEach((k) => { if ($(k)) $(k).disabled = true; });
    api(cuerpo)
      .then((d) => {
        S.actual = d.expediente;
        S.editor = Object.assign({}, ed, { meta: d.meta, contenido: cuerpo.contenido, nuevo: false });
        marcarSucio(false);
        cargarLista().catch(() => {});
        pintarEditor();
        mensaje("ed-mensaje", estado === "presentado" ? "Guardado como presentado. El plazo deja de avisar." : "Guardado.");
      })
      .catch((er) => {
        mensaje("ed-mensaje", er.message, "error");
        ["ed-guardar", "ed-guardar-2"].forEach((k) => { if ($(k)) $(k).disabled = false; });
        window.scrollTo(0, 0);
      });
  }

  /* ================================================================== */
  /* Arranque                                                            */
  /* ================================================================== */

  try {
    if (token) abrirPanel();
  } catch (e) {
    console.error("No se pudo restaurar la sesión:", e);
  }
})();
