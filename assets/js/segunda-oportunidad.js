/**
 * Herramientas públicas de Ley de Segunda Oportunidad.
 *
 *  · #calculo-rapido   calculadora de la portada (tres importes, resultado al momento)
 *  · #calculadora-lso  calculadora completa (recargos, hipoteca, alimentos, embargos)
 *  · [data-urgente]    vía urgente: embargo, demanda o subasta, sin hacer el test
 *  · #test-lso         test de viabilidad, una pregunta por pantalla, con el
 *                      informe personalizado y el formulario de contacto
 *
 * La calculadora rellena por adelantado las preguntas del test que ya puede
 * deducir. El servidor repite todos los cálculos: esto es solo la parte visible.
 *
 * También recuerda el origen de la visita (UTM, gclid, fbclid, referente y
 * página de entrada) para que el panel sepa qué canal trae los clientes.
 */
(function () {
  "use strict";

  /* ---------------- origen de la visita (primer contacto) ---------------- */

  var CLAVE_ORIGEN = "jurmia_lso_origen";

  function leer(almacen, clave) {
    try { return JSON.parse(window[almacen].getItem(clave) || "null"); } catch (e) { return null; }
  }
  function guardar(almacen, clave, valor) {
    try { window[almacen].setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
  }

  (function recordarOrigen() {
    var p = new URLSearchParams(location.search);
    var claves = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "ttclid"];
    var nuevo = {};
    var hay = false;
    claves.forEach(function (k) { if (p.get(k)) { nuevo[k] = p.get(k).slice(0, 200); hay = true; } });
    var previo = leer("sessionStorage", CLAVE_ORIGEN);
    // Una campaña nueva sustituye al origen anterior; si no, se conserva el primero.
    if (hay || !previo) {
      nuevo.referente = document.referrer && document.referrer.indexOf(location.host) === -1 ? document.referrer.slice(0, 300) : "";
      nuevo.entrada = location.pathname;
      guardar("sessionStorage", CLAVE_ORIGEN, nuevo);
    }
  })();

  var M = window.MotorLSO;
  if (!M) return;

  var esc = function (t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var euros = function (n) { return M.euros(Math.round(n || 0)); };

  function evento(nombre, datos) {
    try { if (window.gtag) window.gtag("event", nombre, datos); } catch (e) { /* sin analítica */ }
  }

  function enviarApi(cuerpo) {
    return fetch("/api/segunda-oportunidad", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
        if (!d) throw new Error("respuesta inesperada del servidor (HTTP " + r.status + ")");
        if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
        return d;
      });
    });
  }

  function origenVisita() {
    var o = leer("sessionStorage", CLAVE_ORIGEN) || {};
    o.pagina = location.pathname;
    return o;
  }

  /* ================================================================== */
  /* Calculadora: cuánto podría cancelar                                 */
  /* ================================================================== */

  var CLAVE_CALCULO = "jurmia_lso_calculo";
  var datosCalculo = leer("sessionStorage", CLAVE_CALCULO) || {};
  var CAMPOS = {};
  M.CAMPOS_CALCULADORA.forEach(function (c) { CAMPOS[c.id] = c; });

  function estimacion() { return M.estimarCancelacion(datosCalculo); }
  function hayCalculo() { return estimacion().total > 0; }

  function formatear(v) {
    var n = M.estimarCancelacion({ privadas: v }).datos.privadas;
    return n ? n.toLocaleString("es-ES", { maximumFractionDigits: 2, useGrouping: "always" }) : "";
  }

  function campoImporte(id, prefijo, corto) {
    var c = CAMPOS[id];
    var v = datosCalculo[id] ? formatear(datosCalculo[id]) : "";
    return '<div class="campo campo-importe"><label for="' + prefijo + id + '">' + esc(corto || c.etiqueta) + "</label>" +
      '<div class="importe"><input id="' + prefijo + id + '" data-importe="' + id + '" inputmode="decimal" autocomplete="off" placeholder="0" value="' + esc(v) + '"><span>€</span></div>' +
      (c.ayuda && !corto ? "<small>" + esc(c.ayuda) + "</small>" : "") + "</div>";
  }

  function barra(e) {
    var pct = e.total ? Math.round((e.cancelable / e.total) * 100) : 0;
    return '<div class="barra-cancela" role="img" aria-label="Se cancelaría el ' + pct + ' %"><i style="width:' + pct + '%"></i></div>';
  }

  var ESTADOS = { si: "Se cancela", parcial: "En parte", no: "No se cancela", revisar: "Lo revisamos" };

  function pintarResultadoCalculo(caja, completo) {
    var e = estimacion();
    if (!e.total) {
      caja.innerHTML = '<p class="calc-vacio">' + (completo
        ? "Escriba lo que debe en cada apartado. El cálculo aparece al momento y no se envía a nadie."
        : "Escriba lo que debe y verá al momento cuánto podría cancelar.") + "</p>" +
        '<p class="calc-ejemplo">Ejemplo: con 25.000 € en tarjetas y préstamos y 9.000 € con Hacienda, se podrían cancelar 32.000 €.</p>';
      return;
    }
    var html = '<span class="calc-rotulo">Podría cancelar</span>' +
      '<div class="calc-cifra">' + euros(e.cancelable) + "</div>" +
      '<p class="calc-de">de ' + euros(e.total) + " · " + e.porcentaje + " % de su deuda</p>" + barra(e);
    if (completo) {
      html += '<ul class="calc-lineas">' + e.lineas.map(function (l) {
        return '<li class="' + l.estado + '"><div><b>' + esc(l.nombre) + "</b><small>" + esc(l.motivo) + "</small></div>" +
          '<span><em>' + esc(ESTADOS[l.estado]) + "</em>" + euros(l.cancelable) + "</span></li>";
      }).join("") + "</ul>";
      if (e.perdidaEspera) {
        html += '<p class="calc-espera"><b>Cada mes cuenta.</b> Lo que se embarga antes de declarar el concurso no se devuelve: en seis meses serían ' + euros(e.perdidaEspera) + ".</p>";
      }
    } else if (e.noCancelable > 0) {
      html += '<p class="calc-nota">Hacienda y Seguridad Social se cancelan hasta 10.000 € de principal cada una.</p>';
    }
    html += '<button type="button" class="boton calc-seguir" data-precargar>Comprobar si puedo acogerme</button>' +
      '<p class="calc-letra">Estimación orientativa (art. 489 TRLC y STS 264/2026, de 18 de febrero). Da por hecho que cumple los requisitos de buena fe; la confirma un abogado.</p>';
    caja.innerHTML = html;
  }

  function iniciarCalculadora(raizCalc, completo) {
    if (!raizCalc) return;
    var campos = completo
      ? '<fieldset class="calc-grupo"><legend>Deudas privadas</legend>' + campoImporte("privadas", "cc-") + "</fieldset>" +
        '<fieldset class="calc-grupo"><legend>Hacienda</legend><div class="campo-doble">' + campoImporte("hacienda", "cc-", "Deuda principal") + campoImporte("haciendaRecargos", "cc-", "Recargos e intereses") + "</div></fieldset>" +
        '<fieldset class="calc-grupo"><legend>Seguridad Social</legend><div class="campo-doble">' + campoImporte("tgss", "cc-", "Deuda principal") + campoImporte("tgssRecargos", "cc-", "Recargos e intereses") + "</div></fieldset>" +
        '<fieldset class="calc-grupo"><legend>Otras deudas</legend>' + campoImporte("otrasPublicas", "cc-") +
          '<div class="campo-doble">' + campoImporte("hipoteca", "cc-") + campoImporte("valorVivienda", "cc-") + "</div>" + campoImporte("alimentos", "cc-") + "</fieldset>" +
        '<fieldset class="calc-grupo"><legend>Embargos</legend>' + campoImporte("embargoMensual", "cc-") + "</fieldset>"
      : campoImporte("privadas", "cr-", "Bancos, tarjetas y financieras") + campoImporte("hacienda", "cr-", "Hacienda") + campoImporte("tgss", "cr-", "Seguridad Social");
    raizCalc.innerHTML = '<div class="calc-campos">' + campos + "</div>" + '<div class="calc-resultado" aria-live="polite"></div>' +
      (completo ? "" : '<a class="calc-detalle" href="/ley-segunda-oportunidad/calculadora">Cálculo detallado: recargos, hipoteca y embargos →</a>');
    var salida = raizCalc.querySelector(".calc-resultado");
    pintarResultadoCalculo(salida, completo);
    raizCalc.addEventListener("input", function (ev) {
      var id = ev.target.getAttribute("data-importe");
      if (!id) return;
      datosCalculo[id] = ev.target.value;
      guardar("sessionStorage", CLAVE_CALCULO, datosCalculo);
      pintarResultadoCalculo(salida, completo);
      calculadoras.forEach(function (x) { if (x.raiz !== raizCalc) x.sincronizar(); });
    });
    raizCalc.addEventListener("focusout", function (ev) {
      var id = ev.target.getAttribute("data-importe");
      if (id && ev.target.value) ev.target.value = formatear(ev.target.value);
    });
    raizCalc.addEventListener("click", function (ev) {
      if (!ev.target.closest("[data-precargar]")) return;
      evento("lso_calculadora", { cancelable: Math.round(estimacion().cancelable / 1000) * 1000 });
      precargarTest();
    });
    calculadoras.push({
      raiz: raizCalc,
      sincronizar: function () {
        Array.prototype.forEach.call(raizCalc.querySelectorAll("[data-importe]"), function (inp) {
          if (document.activeElement !== inp) inp.value = datosCalculo[inp.getAttribute("data-importe")] ? formatear(datosCalculo[inp.getAttribute("data-importe")]) : "";
        });
        pintarResultadoCalculo(salida, completo);
      }
    });
  }

  var calculadoras = [];

  /** Lleva al test con las preguntas que la calculadora ya responde. */
  function precargarTest() {
    var previas = (leer("sessionStorage", "jurmia_lso_test") || {}).respuestas || {};
    var r = Object.assign({}, previas, M.respuestasDesdeCalculo(estimacion()));
    var indice = M.preguntasVisibles(r).findIndex(function (p) { return r[p.id] === undefined; });
    guardar("sessionStorage", "jurmia_lso_test", { respuestas: r, indice: indice === -1 ? 0 : indice });
    if (window.TestLSO) {
      window.TestLSO.recargar();
      var t = document.getElementById("test");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      location.href = "/ley-segunda-oportunidad#test";
    }
  }

  iniciarCalculadora(document.getElementById("calculo-rapido"), false);
  iniciarCalculadora(document.getElementById("calculadora-lso"), true);

  /* ================================================================== */
  /* Vía urgente: embargo, demanda o subasta                             */
  /* ================================================================== */

  var URGENCIAS = [["embargo", "Me embargan la nómina, la pensión o la cuenta"], ["demanda", "Tengo una demanda, un monitorio o una carta del juzgado"],
    ["subasta", "Van a subastar mi vivienda o hay un desahucio"], ["otra", "Otra urgencia"]];

  Array.prototype.forEach.call(document.querySelectorAll("[data-urgente]"), function (caja, n) {
    var p = "ur" + n + "-";
    caja.innerHTML = '<form class="form-urgente" novalidate>' +
      '<div class="campo"><label for="' + p + 'tipo">Qué le ocurre</label><select id="' + p + 'tipo">' +
        URGENCIAS.map(function (u) { return '<option value="' + u[0] + '">' + esc(u[1]) + "</option>"; }).join("") + "</select></div>" +
      '<div class="campo-doble"><div class="campo"><label for="' + p + 'nombre">Nombre</label><input id="' + p + 'nombre" autocomplete="name" maxlength="120"></div>' +
      '<div class="campo"><label for="' + p + 'telefono">Teléfono</label><input id="' + p + 'telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="40"></div></div>' +
      '<label class="consentimiento"><input type="checkbox" id="' + p + 'consentimiento"><span>Acepto la <a href="/privacidad">política de privacidad</a> y que JURMIA Abogados me llame para estudiar mi caso.</span></label>' +
      '<input type="text" class="trampa" id="' + p + 'empresa" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<button type="submit" class="boton">Llámenme con prioridad</button>' +
      '<div class="aviso-envio" role="alert"></div></form>';
    var form = caja.querySelector("form");
    var avisoU = function (t, error) {
      var a = form.querySelector(".aviso-envio");
      a.textContent = t; a.classList.add("visible"); a.style.borderLeftColor = error ? "#a12a2a" : "";
    };
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var $u = function (k) { return document.getElementById(p + k); };
      if (!$u("nombre").value.trim()) { $u("nombre").focus(); return avisoU("Díganos su nombre.", true); }
      if ($u("telefono").value.replace(/\D/g, "").length < 9) { $u("telefono").focus(); return avisoU("Revise el teléfono: necesitamos al menos nueve cifras.", true); }
      if (!$u("consentimiento").checked) return avisoU("Para llamarle necesitamos que acepte la política de privacidad.", true);
      var boton = form.querySelector("button[type=submit]");
      boton.disabled = true;
      avisoU("Enviando…");
      enviarApi({
        urgente: { tipo: $u("tipo").value }, nombre: $u("nombre").value.trim(), telefono: $u("telefono").value.trim(),
        consentimiento: true, empresa: $u("empresa").value, origen: origenVisita(),
        calculo: hayCalculo() ? datosCalculo : undefined
      }).then(function (d) {
        evento("generate_lead", { tipo_consulta: "segunda_oportunidad", origen: "urgente", urgencia: $u("tipo").value });
        form.innerHTML = '<div class="urgente-ok"><b>Recibido. Le llamamos con prioridad.</b><p>Su referencia es ' + esc(d.referencia) +
          ". Tenga a mano la notificación del embargo o del juzgado. Si puede, haga mientras tanto el test: nos ayuda a preparar la llamada.</p>" +
          '<a class="boton boton-linea" href="#test">Hacer el test</a></div>';
      }).catch(function (e) {
        avisoU("No hemos podido enviarlo: " + e.message + ". Llámenos y le atendemos igual.", true);
        boton.disabled = false;
      });
    });
  });

  /* ================================================================== */
  /* Test de viabilidad                                                  */
  /* ================================================================== */

  var raiz = document.getElementById("test-lso");
  if (!raiz) return;

  /* ---------------- estado ---------------- */

  var CLAVE_TEST = "jurmia_lso_test";
  var guardado = leer("sessionStorage", CLAVE_TEST) || {};
  var respuestas = guardado.respuestas || {};
  var indice = Math.max(0, guardado.indice || 0);
  var contacto = { canal: "llamada", franja: "indiferente", urgente: "" };

  /** La calculadora deja respuestas precargadas: el test sigue desde la primera que falta. */
  window.TestLSO = {
    recargar: function () {
      var g = leer("sessionStorage", CLAVE_TEST) || {};
      respuestas = g.respuestas || {};
      indice = Math.max(0, g.indice || 0);
      pintarPregunta();
    }
  };
  var enviado = null;

  function persistir() {
    guardar("sessionStorage", CLAVE_TEST, { respuestas: respuestas, indice: indice });
  }

  var dos = function (n) { return (n < 10 ? "0" : "") + n; };

  function visibles() { return M.preguntasVisibles(respuestas); }

  /** Quita respuestas de preguntas que ya no se muestran (p. ej. si cambia los bienes). */
  function depurar() {
    M.PREGUNTAS.forEach(function (p) {
      if (p.si && !p.si(respuestas)) delete respuestas[p.id];
    });
  }

  function enfocarTitulo() {
    var h = raiz.querySelector("[data-foco]");
    if (!h) return;
    h.setAttribute("tabindex", "-1");
    try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
    var arriba = raiz.getBoundingClientRect().top;
    if (arriba < 60 || arriba > window.innerHeight * 0.5) {
      window.scrollTo({ top: window.scrollY + arriba - 100, behavior: "smooth" });
    }
  }

  /* ---------------- preguntas ---------------- */

  function pintarPregunta() {
    var lista = visibles();
    if (indice >= lista.length) return pintarResultado();
    var p = lista[indice];
    var valor = respuestas[p.id];
    var marcadas = p.multiple ? (valor || []) : [];
    var pct = Math.round((indice / lista.length) * 100);

    var opciones = p.opciones.map(function (o) {
      var activa = p.multiple ? marcadas.indexOf(o.valor) !== -1 : valor === o.valor;
      var atributo = p.multiple ? 'role="checkbox" aria-checked="' + activa + '"' : 'aria-pressed="' + activa + '"';
      return '<button type="button" class="opcion ' + (p.multiple ? "multiple" : "unica") + '" data-valor="' + esc(o.valor) + '" ' + atributo + ">" +
        '<span class="marca-caja" aria-hidden="true"></span><span>' + esc(o.texto) +
        (o.ayuda ? "<small>" + esc(o.ayuda) + "</small>" : "") + "</span></button>";
    }).join("");

    raiz.innerHTML =
      '<div class="test-cabeza"><span>Pregunta ' + (indice + 1) + " de " + lista.length + "</span><span>" + pct + " %</span></div>" +
      '<div class="test-barra" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<div class="paso-cabecera"><span class="paso-numero">' + dos(indice + 1) + "</span><div>" +
        '<h2 data-foco id="pregunta-titulo">' + esc(p.titulo) + "</h2>" + (p.ayuda ? "<p>" + esc(p.ayuda) + "</p>" : "") +
      "</div></div>" +
      '<div class="opciones" role="group" aria-labelledby="pregunta-titulo">' + opciones + "</div>" +
      '<div class="test-pie">' +
        '<button type="button" class="enlace-atras" data-accion="atras"' + (indice === 0 ? " hidden" : "") + ">← Anterior</button>" +
        (p.multiple
          ? '<button type="button" class="boton" data-accion="seguir"' + (marcadas.length ? "" : " disabled") + ">Continuar</button>"
          : (valor ? '<button type="button" class="boton boton-linea" data-accion="seguir">Continuar</button>' : "<span></span>")) +
      "</div>";
  }

  function elegir(boton) {
    var p = visibles()[indice];
    var v = boton.getAttribute("data-valor");
    if (!p.multiple) {
      respuestas[p.id] = v;
      depurar();
      Array.prototype.forEach.call(raiz.querySelectorAll(".opcion"), function (b) {
        b.setAttribute("aria-pressed", String(b === boton));
      });
      persistir();
      setTimeout(function () { avanzar(); }, 180);
      return;
    }
    var lista = (respuestas[p.id] || []).slice();
    var pos = lista.indexOf(v);
    if (pos === -1) {
      // «Ninguno» excluye al resto y al revés.
      if (v === "ninguno") lista = [];
      else lista = lista.filter(function (x) { return x !== "ninguno"; });
      lista.push(v);
    } else {
      lista.splice(pos, 1);
    }
    respuestas[p.id] = lista;
    if (!lista.length) delete respuestas[p.id];
    depurar();
    persistir();
    Array.prototype.forEach.call(raiz.querySelectorAll(".opcion"), function (b) {
      b.setAttribute("aria-checked", String(lista.indexOf(b.getAttribute("data-valor")) !== -1));
    });
    var seguir = raiz.querySelector('[data-accion="seguir"]');
    if (seguir) seguir.disabled = !lista.length;
  }

  function avanzar() {
    var p = visibles()[indice];
    if (!p || respuestas[p.id] === undefined) return;
    indice++;
    persistir();
    if (indice >= visibles().length) {
      evento("lso_test_completado", {});
      pintarResultado();
    } else {
      pintarPregunta();
    }
    enfocarTitulo();
  }

  function retroceder() {
    if (indice === 0) return;
    indice = Math.min(indice - 1, visibles().length - 1);
    persistir();
    pintarPregunta();
    enfocarTitulo();
  }

  /* ---------------- resultado y contacto ---------------- */

  function resultado() {
    return M.evaluar(M.normalizarRespuestas(respuestas));
  }

  var ETIQUETAS = { alto: "Encaja", medio: "Puede encajar", estudio: "Hay que estudiarlo" };

  function pintarResultado() {
    var r = resultado();
    var puntos = r.puntos.map(function (x) {
      return '<li class="' + x.tipo + '">' + esc(x.texto) + "</li>";
    }).join("");
    var provincias = M.PROVINCIAS.map(function (p) { return '<option value="' + esc(p) + '">' + esc(p) + "</option>"; }).join("");

    var tipos = (respuestas.tipos || []).map(function (t) { return M.SEMAFORO_TIPOS[t]; }).filter(Boolean);
    var pasos = M.HOJA_DE_RUTA[r.via] || [];
    var e = estimacion();

    raiz.innerHTML =
      '<div class="resultado" role="status">' +
        '<span class="rotulo">Su informe</span>' +
        '<span class="via ' + r.encaje + '">' + esc(ETIQUETAS[r.encaje]) + "</span>" +
        '<h2 data-foco>' + esc(r.titulo) + "</h2>" +
        "<p>" + esc(r.resumen) + "</p>" +
        (e.total ? '<div class="informe-calculo"><span>Con los importes de su cálculo</span><b>podría cancelar ' + euros(e.cancelable) + "</b> de " + euros(e.total) + barra(e) + "</div>" : "") +
        (tipos.length ? '<h3 class="informe-titulo">Sus deudas, una a una</h3><ul class="semaforo">' + tipos.map(function (t) {
          return '<li class="' + t.estado + '"><span>' + esc(ESTADOS[t.estado]) + "</span><div><b>" + esc(t.texto) + "</b><small>" + esc(t.detalle) + "</small></div></li>";
        }).join("") + "</ul>" : "") +
        '<details class="informe-detalle"><summary>Lo que hemos tenido en cuenta (' + r.puntos.length + ")</summary><ul class=\"puntos\">" + puntos + "</ul></details>" +
        '<div class="via-caja"><small>Vía más probable</small><strong>' + esc(r.viaTitulo) + "</strong><p>" + esc(r.viaTexto) + "</p></div>" +
        (pasos.length ? '<h3 class="informe-titulo">Cómo sería su procedimiento</h3><ol class="ruta">' + pasos.map(function (x) {
          return "<li><b>" + esc(x.titulo) + "</b><p>" + esc(x.texto) + "</p></li>";
        }).join("") + "</ol>" : "") +
      "</div>" +

      '<form class="contacto-test" id="form-lso" novalidate>' +
        '<div class="paso-cabecera"><span class="paso-numero">' + dos(visibles().length + 1) + "</span><div>" +
          "<h3>Reciba su informe y hable con un abogado</h3>" +
          "<p>Le enviamos este informe por correo, con la lista de documentos que necesitará, y un abogado del despacho le llama en 24 horas laborables. La primera consulta es gratuita y sin compromiso.</p>" +
        "</div></div>" +
        '<div class="campo-doble">' +
          '<div class="campo"><label for="lso-nombre">Nombre y apellidos</label><input id="lso-nombre" name="nombre" autocomplete="name" required maxlength="120"></div>' +
          '<div class="campo"><label for="lso-telefono">Teléfono</label><input id="lso-telefono" name="telefono" type="tel" inputmode="tel" autocomplete="tel" required maxlength="40"></div>' +
        "</div>" +
        '<div class="campo-doble">' +
          '<div class="campo"><label for="lso-email">Correo electrónico (para enviarle el informe)</label><input id="lso-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="160"></div>' +
          '<div class="campo"><label for="lso-provincia">Provincia</label><select id="lso-provincia" name="provincia"><option value="">Elija su provincia</option>' + provincias + "</select></div>" +
        "</div>" +
        '<div class="campo-doble">' +
          '<div class="campo"><span class="etiqueta-grupo" id="et-canal">Prefiere que le contactemos por</span><div class="elige" data-grupo="canal" role="group" aria-labelledby="et-canal">' +
            botonElige("canal", "llamada", "Llamada") + botonElige("canal", "whatsapp", "WhatsApp") + botonElige("canal", "email", "Correo") +
          "</div></div>" +
          '<div class="campo"><span class="etiqueta-grupo" id="et-franja">Mejor momento</span><div class="elige" data-grupo="franja" role="group" aria-labelledby="et-franja">' +
            botonElige("franja", "manana", "Mañana") + botonElige("franja", "tarde", "Tarde") + botonElige("franja", "indiferente", "Me da igual") +
          "</div></div>" +
        "</div>" +
        (respuestas.embargos === "si"
          ? '<div class="campo"><span class="etiqueta-grupo" id="et-urgente">¿Hay algo urgente?</span><div class="elige" data-grupo="urgente" role="group" aria-labelledby="et-urgente">' +
            botonElige("urgente", "", "No") + botonElige("urgente", "embargo", "Un embargo") + botonElige("urgente", "demanda", "Demanda o monitorio") + botonElige("urgente", "subasta", "Subasta o desahucio") +
            "</div></div>"
          : "") +
        '<div class="campo"><label for="lso-observaciones">¿Quiere contarnos algo más? (opcional)</label>' +
          '<textarea id="lso-observaciones" name="observaciones" rows="3" maxlength="2000" placeholder="Me embargan la nómina desde marzo, tengo un juicio la semana que viene…"></textarea></div>' +
        '<label class="consentimiento"><input type="checkbox" id="lso-consentimiento"><span>He leído y acepto la <a href="/privacidad">política de privacidad</a>. Autorizo a JURMIA Abogados a tratar mis datos para estudiar mi caso y ponerse en contacto conmigo.</span></label>' +
        '<label class="consentimiento"><input type="checkbox" id="lso-comercial"><span>Quiero recibir información del despacho sobre novedades que puedan interesarme (opcional).</span></label>' +
        '<input type="text" id="lso-empresa" class="trampa" tabindex="-1" autocomplete="off" aria-hidden="true">' +
        '<div class="envio"><button type="submit" class="boton" id="lso-enviar">Enviarme el informe y que me llame un abogado</button><span>Gratis y sin compromiso</span></div>' +
        '<div class="aviso-envio" id="lso-aviso" role="alert"></div>' +
        '<div class="test-pie"><button type="button" class="enlace-atras" data-accion="revisar">← Revisar mis respuestas</button></div>' +
      "</form>";
  }

  function botonElige(grupo, valor, texto) {
    return '<button type="button" data-valor="' + valor + '" aria-pressed="' + (contacto[grupo] === valor) + '">' + texto + "</button>";
  }

  function aviso(texto, error) {
    var caja = document.getElementById("lso-aviso");
    if (!caja) return;
    caja.textContent = texto;
    caja.classList.add("visible");
    caja.classList.toggle("error", Boolean(error));
    caja.style.borderLeftColor = error ? "#a12a2a" : "";
  }

  function enviar(ev) {
    ev.preventDefault();
    var $ = function (id) { return document.getElementById(id); };
    var nombre = $("lso-nombre").value.trim();
    var telefono = $("lso-telefono").value.trim();
    var email = $("lso-email").value.trim();
    if (!nombre) { $("lso-nombre").focus(); return aviso("Díganos su nombre para poder llamarle.", true); }
    if (telefono.replace(/\D/g, "").length < 9) { $("lso-telefono").focus(); return aviso("Revise el teléfono: necesitamos un número de al menos nueve cifras.", true); }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("lso-email").focus(); return aviso("Revise el correo electrónico o déjelo en blanco.", true); }
    if (contacto.canal === "email" && !email) { $("lso-email").focus(); return aviso("Si prefiere que le escribamos por correo, indíquenos la dirección.", true); }
    if (!$("lso-consentimiento").checked) return aviso("Para estudiar su caso necesitamos que acepte la política de privacidad.", true);

    var boton = $("lso-enviar");
    boton.disabled = true;
    aviso("Enviando su caso al despacho…");

    var origen = origenVisita();

    var cuerpo = {
      respuestas: M.normalizarRespuestas(respuestas),
      nombre: nombre,
      telefono: telefono,
      email: email,
      provincia: $("lso-provincia").value,
      canal: contacto.canal,
      franja: contacto.franja,
      observaciones: $("lso-observaciones").value.trim(),
      consentimiento: true,
      comercial: $("lso-comercial").checked,
      empresa: $("lso-empresa").value,
      origen: origen,
      calculo: hayCalculo() ? datosCalculo : undefined,
      urgente: contacto.urgente ? { tipo: contacto.urgente } : undefined
    };

    enviarApi(cuerpo)
      .then(function (d) {
        var r = resultado();
        evento("generate_lead", { tipo_consulta: "segunda_oportunidad", origen: "landing_lso", encaje: r.encaje, via: r.via });
        enviado = { referencia: d.referencia, nombre: nombre, email: email, canal: contacto.canal };
        try { sessionStorage.removeItem(CLAVE_TEST); } catch (e) { /* nada */ }
        pintarRecibido();
        enfocarTitulo();
      })
      .catch(function (e) {
        aviso("No hemos podido enviarlo: " + e.message + ". Llámenos o escríbanos a info@jurmiabogados.es y lo vemos igualmente.", true);
        boton.disabled = false;
      });
  }

  function pintarRecibido() {
    var r = resultado();
    var docs = M.documentosRequeridos(Object.assign({ tipos: [], bienes: [] }, M.normalizarRespuestas(respuestas))).slice(0, 5);
    var nombre = (enviado.nombre || "").split(/\s+/)[0];
    var como = { llamada: "le llamará", whatsapp: "le escribirá por WhatsApp", email: "le escribirá por correo" }[enviado.canal] || "le llamará";
    raiz.innerHTML =
      '<div class="recibido">' +
        '<span class="rotulo">Recibido</span>' +
        '<h2 data-foco>Gracias' + (nombre ? ", " + esc(nombre) : "") + ". Ya tenemos su caso.</h2>" +
        '<p class="referencia">Referencia ' + esc(enviado.referencia) + "</p>" +
        '<ol class="siguientes">' +
          "<li><div><strong>Un abogado " + como + " en 24 horas laborables</strong><p>Revisará con usted el resultado del test (" + esc(r.viaTitulo.toLowerCase()) + ") y resolverá sus dudas.</p></div></li>" +
          "<li><div><strong>Le pedimos la documentación</strong><p>Le diremos exactamente qué papeles hacen falta y cómo conseguir cada uno.</p></div></li>" +
          "<li><div><strong>Precio cerrado antes de empezar</strong><p>Si decide seguir, le damos los honorarios por escrito y en cuotas. Sin sorpresas.</p></div></li>" +
        "</ol>" +
        '<div class="docs-adelanto"><strong>Si quiere adelantar, vaya reuniendo:</strong><ul>' +
          docs.map(function (x) { return "<li>" + esc(x.nombre) + "<br><small>" + esc(x.comoConseguirlo) + "</small></li>"; }).join("") +
        "</ul></div>" +
        (enviado.email ? '<p class="nota-legal">Le hemos enviado su informe a ' + esc(enviado.email) + ". Si no lo ve en unos minutos, revise la carpeta de correo no deseado.</p>" : "") +
      "</div>";
  }

  /* ---------------- eventos ---------------- */

  raiz.addEventListener("click", function (ev) {
    var opcion = ev.target.closest(".opcion");
    if (opcion) return elegir(opcion);
    var elige = ev.target.closest(".elige button");
    if (elige) {
      var grupo = elige.parentNode.getAttribute("data-grupo");
      contacto[grupo] = elige.getAttribute("data-valor");
      Array.prototype.forEach.call(elige.parentNode.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-pressed", String(b === elige));
      });
      return;
    }
    var accion = ev.target.closest("[data-accion]");
    if (!accion) return;
    var a = accion.getAttribute("data-accion");
    if (a === "seguir") avanzar();
    else if (a === "atras") retroceder();
    else if (a === "revisar") { indice = visibles().length - 1; persistir(); pintarPregunta(); enfocarTitulo(); }
  });

  raiz.addEventListener("submit", function (ev) {
    if (ev.target.id === "form-lso") enviar(ev);
  });

  // Teclado: Intro avanza en las preguntas de varias respuestas.
  raiz.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" || ev.target.tagName === "TEXTAREA" || ev.target.closest("form")) return;
    var seguir = raiz.querySelector('[data-accion="seguir"]');
    if (seguir && !seguir.disabled && !ev.target.closest(".opcion")) { ev.preventDefault(); avanzar(); }
  });

  raiz.classList.add("test");
  pintarPregunta();
})();
