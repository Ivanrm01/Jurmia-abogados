/**
 * JURMIA Abogados — consentimiento de cookies
 *
 * Cumple la Guía sobre el uso de las cookies de la AEPD (2023) y el RGPD:
 *
 *  - Nada de analítica ni publicidad se carga antes del consentimiento.
 *  - Rechazar es tan fácil y visible como aceptar (mismo nivel, mismo tamaño).
 *  - Ninguna casilla viene marcada de antemano.
 *  - El consentimiento se puede retirar en cualquier momento, con la misma
 *    facilidad con la que se dio (enlace permanente en el pie).
 *  - Se guarda prueba del consentimiento: fecha, versión y opciones elegidas.
 *  - Caduca a los 24 meses y se vuelve a preguntar.
 *  - Se usa el Consent Mode v2 de Google, obligatorio en el EEE desde 2024.
 *
 * ---------------------------------------------------------------------------
 * CONFIGURACIÓN: rellene solo estos identificadores cuando dé de alta cada
 * servicio. Si un valor queda vacío, ese servicio sencillamente no se carga.
 * ---------------------------------------------------------------------------
 */
window.JURMIA_COOKIES = {
  ga4: "",                     // Google Analytics 4, p. ej. "G-XXXXXXXXXX"
  metaPixel: "",    // Meta (Facebook) Pixel, p. ej. "123456789012345"
  googleAds: "",    // Google Ads, p. ej. "AW-XXXXXXXXX"
  linkedIn: ""      // LinkedIn Insight Tag, p. ej. "1234567"
};

(function () {
  "use strict";

  var CLAVE = "jurmia_consentimiento";
  var VERSION = 1;                        // súbala si cambian las categorías
  var MESES = 24;

  var cfg = window.JURMIA_COOKIES || {};

  /* ------------------------------------------------------------------ */
  /* Almacenamiento del consentimiento                                    */
  /* ------------------------------------------------------------------ */

  function leer() {
    try {
      var d = JSON.parse(localStorage.getItem(CLAVE) || "null");
      if (!d || d.version !== VERSION) return null;
      var caduca = new Date(d.fecha);
      caduca.setMonth(caduca.getMonth() + MESES);
      return caduca > new Date() ? d : null;
    } catch (e) {
      return null;
    }
  }

  function guardar(opciones) {
    var registro = {
      version: VERSION,
      fecha: new Date().toISOString(),
      analitica: !!opciones.analitica,
      marketing: !!opciones.marketing
    };
    try {
      localStorage.setItem(CLAVE, JSON.stringify(registro));
    } catch (e) {
      /* si el navegador lo impide, el consentimiento vale solo para esta visita */
    }
    return registro;
  }

  /* ------------------------------------------------------------------ */
  /* Consent Mode v2 de Google                                            */
  /* ------------------------------------------------------------------ */

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  // Por defecto, todo denegado. Debe ejecutarse antes de cargar cualquier script.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    functionality_storage: "granted",
    security_storage: "granted",
    wait_for_update: 500
  });

  function actualizarConsentimiento(c) {
    gtag("consent", "update", {
      analytics_storage: c.analitica ? "granted" : "denied",
      ad_storage: c.marketing ? "granted" : "denied",
      ad_user_data: c.marketing ? "granted" : "denied",
      ad_personalization: c.marketing ? "granted" : "denied"
    });
  }

  /* ------------------------------------------------------------------ */
  /* Carga de los servicios, solo tras el consentimiento                  */
  /* ------------------------------------------------------------------ */

  var cargados = {};

  function script(src, alCargar) {
    var s = document.createElement("script");
    s.async = true;
    s.src = src;
    if (alCargar) s.onload = alCargar;
    document.head.appendChild(s);
  }

  function cargarAnalitica() {
    if (cargados.analitica || !cfg.ga4) return;
    cargados.analitica = true;
    script("https://www.googletagmanager.com/gtag/js?id=" + cfg.ga4, function () {
      gtag("js", new Date());
      gtag("config", cfg.ga4, { anonymize_ip: true });
    });
  }

  function cargarMarketing() {
    if (cargados.marketing) return;
    cargados.marketing = true;

    if (cfg.googleAds) {
      script("https://www.googletagmanager.com/gtag/js?id=" + cfg.googleAds, function () {
        gtag("js", new Date());
        gtag("config", cfg.googleAds);
      });
    }

    if (cfg.metaPixel) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      /* eslint-enable */
      window.fbq("init", cfg.metaPixel);
      window.fbq("track", "PageView");
    }

    if (cfg.linkedIn) {
      window._linkedin_partner_id = cfg.linkedIn;
      window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
      window._linkedin_data_partner_ids.push(cfg.linkedIn);
      script("https://snap.licdn.com/li.lms-analytics/insight.min.js");
    }
  }

  function aplicar(c) {
    actualizarConsentimiento(c);
    if (c.analitica) cargarAnalitica();
    if (c.marketing) cargarMarketing();
  }

  /* ------------------------------------------------------------------ */
  /* Borrado de cookies al retirar el consentimiento                      */
  /* ------------------------------------------------------------------ */

  function borrarCookiesDe(prefijos) {
    var dominio = location.hostname.replace(/^www\./, "");
    document.cookie.split(";").forEach(function (c) {
      var nombre = c.split("=")[0].trim();
      var coincide = prefijos.some(function (p) { return nombre.indexOf(p) === 0; });
      if (!coincide) return;
      ["/", location.pathname].forEach(function (ruta) {
        ["", dominio, "." + dominio, location.hostname].forEach(function (d) {
          document.cookie = nombre + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=" + ruta +
            (d ? "; domain=" + d : "");
        });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Interfaz                                                             */
  /* ------------------------------------------------------------------ */

  function crearBanner() {
    if (document.getElementById("aviso-cookies")) return;

    var aviso = document.createElement("div");
    aviso.id = "aviso-cookies";
    aviso.className = "aviso-cookies";
    aviso.setAttribute("role", "dialog");
    aviso.setAttribute("aria-modal", "false");
    aviso.setAttribute("aria-labelledby", "cookies-titulo");
    aviso.innerHTML =
      '<div class="cookies-caja">' +
        '<div class="cookies-texto">' +
          '<h2 id="cookies-titulo">Cookies en esta web</h2>' +
          '<p>Usamos cookies propias necesarias para que la web funcione y, si nos lo autoriza, ' +
          'cookies de terceros para medir el uso del sitio y para publicidad. ' +
          'Puede aceptarlas todas, rechazarlas todas o elegir por categorías. ' +
          'Más detalle en la <a href="/politica-cookies">política de cookies</a>.</p>' +
        '</div>' +
        '<div class="cookies-botones">' +
          '<button type="button" class="cookies-btn cookies-secundario" data-accion="configurar">Configurar</button>' +
          '<button type="button" class="cookies-btn cookies-secundario" data-accion="rechazar">Rechazar todas</button>' +
          '<button type="button" class="cookies-btn cookies-principal" data-accion="aceptar">Aceptar todas</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(aviso);
    aviso.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var a = b.dataset.accion;
      if (a === "aceptar") decidir({ analitica: true, marketing: true });
      if (a === "rechazar") decidir({ analitica: false, marketing: false });
      if (a === "configurar") abrirPanel();
    });

    requestAnimationFrame(function () { aviso.classList.add("visible"); });
  }

  function cerrarBanner() {
    var a = document.getElementById("aviso-cookies");
    if (a) { a.classList.remove("visible"); setTimeout(function () { a.remove(); }, 300); }
  }

  function crearPanel() {
    if (document.getElementById("panel-cookies")) return document.getElementById("panel-cookies");

    var dlg = document.createElement("dialog");
    dlg.id = "panel-cookies";
    dlg.className = "panel-cookies";
    dlg.innerHTML =
      '<form method="dialog">' +
        '<h2>Configuración de cookies</h2>' +
        '<p class="cookies-intro">Elija qué categorías autoriza. Puede cambiar esta decisión ' +
        'cuando quiera desde «Configurar cookies», en el pie de la web.</p>' +

        '<div class="cookies-categoria">' +
          '<div class="cookies-cabecera">' +
            '<h3>Necesarias</h3>' +
            '<span class="cookies-fija">Siempre activas</span>' +
          '</div>' +
          '<p>Permiten el funcionamiento básico y la seguridad del sitio, y recuerdan esta misma ' +
          'decisión sobre cookies. Están exentas de consentimiento, por lo que no pueden desactivarse.</p>' +
        '</div>' +

        '<div class="cookies-categoria">' +
          '<div class="cookies-cabecera">' +
            '<h3>Analíticas</h3>' +
            '<label class="cookies-interruptor">' +
              '<input type="checkbox" id="c-analitica">' +
              '<span></span>' +
            '</label>' +
          '</div>' +
          '<p>Nos dicen qué páginas se visitan y cómo llega la gente al sitio, de forma agregada. ' +
          'Sirven para mejorar el contenido. Proveedor: Google Analytics.</p>' +
        '</div>' +

        '<div class="cookies-categoria">' +
          '<div class="cookies-cabecera">' +
            '<h3>Publicidad</h3>' +
            '<label class="cookies-interruptor">' +
              '<input type="checkbox" id="c-marketing">' +
              '<span></span>' +
            '</label>' +
          '</div>' +
          '<p>Permiten medir la eficacia de nuestras campañas y mostrar anuncios en otras ' +
          'plataformas. Proveedores: Google Ads, Meta y LinkedIn.</p>' +
        '</div>' +

        '<p class="cookies-nota">Algunos de estos proveedores están fuera del Espacio Económico ' +
        'Europeo. Esas transferencias se amparan en las decisiones de adecuación de la Comisión ' +
        'Europea o en cláusulas contractuales tipo. El detalle está en la ' +
        '<a href="/politica-cookies">política de cookies</a>.</p>' +

        '<div class="cookies-acciones">' +
          '<button type="button" class="cookies-btn cookies-secundario" data-accion="rechazar">Rechazar todas</button>' +
          '<button type="button" class="cookies-btn cookies-secundario" data-accion="aceptar">Aceptar todas</button>' +
          '<button type="button" class="cookies-btn cookies-principal" data-accion="guardar">Guardar preferencias</button>' +
        '</div>' +
      '</form>';

    document.body.appendChild(dlg);

    dlg.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var a = b.dataset.accion;
      if (a === "aceptar") { dlg.close(); decidir({ analitica: true, marketing: true }); }
      if (a === "rechazar") { dlg.close(); decidir({ analitica: false, marketing: false }); }
      if (a === "guardar") {
        dlg.close();
        decidir({
          analitica: document.getElementById("c-analitica").checked,
          marketing: document.getElementById("c-marketing").checked
        });
      }
    });

    return dlg;
  }

  function abrirPanel() {
    var dlg = crearPanel();
    var actual = leer() || { analitica: false, marketing: false };
    document.getElementById("c-analitica").checked = !!actual.analitica;
    document.getElementById("c-marketing").checked = !!actual.marketing;
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
  }

  function decidir(opciones) {
    var anterior = leer();
    var registro = guardar(opciones);
    cerrarBanner();

    // Si se retira algo que antes estaba autorizado, se limpian esas cookies.
    if (anterior && anterior.analitica && !registro.analitica) borrarCookiesDe(["_ga", "_gid", "_gat"]);
    if (anterior && anterior.marketing && !registro.marketing) borrarCookiesDe(["_fbp", "_fbc", "_gcl", "li_", "bcookie", "lidc"]);

    aplicar(registro);

    if (anterior && (anterior.analitica !== registro.analitica || anterior.marketing !== registro.marketing)) {
      location.reload();  // asegura que no queda nada cargado de la decisión anterior
    }
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                             */
  /* ------------------------------------------------------------------ */

  function iniciar() {
    // Enlace permanente del pie para revisar la decisión
    document.querySelectorAll('[data-cookies="configurar"]').forEach(function (el) {
      el.addEventListener("click", function (e) { e.preventDefault(); abrirPanel(); });
    });

    var guardado = leer();
    if (guardado) {
      aplicar(guardado);
    } else {
      crearBanner();
    }
  }

  // API mínima por si se necesita desde otra parte del sitio
  window.jurmiaCookies = {
    abrir: abrirPanel,
    estado: leer,
    retirar: function () {
      try { localStorage.removeItem(CLAVE); } catch (e) {}
      location.reload();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
