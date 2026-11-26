/**
 * ACCESO AL PANEL /admin · común a todas las secciones
 * (blog, vuelos, revolving, segunda oportunidad y seguridad)
 * ---------------------------------------------------------------------------
 * Se carga antes que el script de cada panel y le ofrece:
 *
 *   JurmiaAcceso.entrar(correo, clave) → Promise con { token, nombre, correo… }
 *       Hace el paso 1 (contraseña) y, si la cuenta tiene verificación en dos
 *       pasos, muestra el paso 2 (código de la app o de recuperación) dentro
 *       de la misma tarjeta de acceso. Se resuelve cuando la sesión está abierta.
 *   JurmiaAcceso.salir()   cierra la sesión también en el servidor.
 *   JurmiaAcceso.yo()      quién está conectado (y mantiene viva la sesión).
 *
 * Además, sin que el panel tenga que hacer nada:
 *
 *   · Si una petición del panel recibe un 401 (la sesión caducó por
 *     inactividad, pasaron las 12 horas o se cerró desde otro dispositivo),
 *     en lugar de recargar la página y perder lo que se estaba escribiendo,
 *     pide de nuevo la contraseña (y el código) encima del panel y repite la
 *     petición. Todas las pestañas usan el token nuevo.
 *   · Mientras se trabaja (teclear, tocar, desplazarse) mantiene la sesión viva.
 *   · Avisa, arriba del panel, si la cuenta no tiene activada la verificación
 *     en dos pasos.
 */
(function () {
  "use strict";
  if (window.JurmiaAcceso) return;

  var CLAVE = {
    token: "jurmia_token",
    usuario: "jurmia_usuario",
    actividad: "jurmia_actividad",
    caduca: "jurmia_caduca",
    inactividad: "jurmia_inactividad"
  };
  var PING_MS = 4 * 60 * 1000;
  var EN_SEGURIDAD = /^\/admin\/seguridad/.test(location.pathname);
  var fetchOriginal = window.fetch.bind(window);

  var almacen = {
    leer: function (k) {
      try { return localStorage.getItem(k) || sessionStorage.getItem(k) || null; } catch (e) { return null; }
    },
    guardar: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } },
    borrar: function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* nada */ }
      try { sessionStorage.removeItem(k); } catch (e) { /* nada */ }
    }
  };

  var FORMATO_TOKEN = /^[a-f0-9]{64}$/;
  var inactividadMs = function () { return (Number(almacen.leer(CLAVE.inactividad)) || 1800) * 1000; };
  var usuarioGuardado = function () {
    try { return JSON.parse(almacen.leer(CLAVE.usuario) || "null"); } catch (e) { return null; }
  };

  /* -------------------------------------------------------------------- */
  /* 1. Al cargar: fuera los tokens que ya no pueden valer                 */
  /*    (los firmados de la versión anterior, o tras la inactividad), para */
  /*    que el panel muestre directamente la pantalla de acceso.          */
  /* -------------------------------------------------------------------- */
  (function () {
    var t = almacen.leer(CLAVE.token);
    if (!t) return;
    var ahora = Date.now();
    var actividad = Number(almacen.leer(CLAVE.actividad)) || 0;
    var caduca = Number(almacen.leer(CLAVE.caduca)) || 0;
    if (!FORMATO_TOKEN.test(t) || (actividad && ahora - actividad > inactividadMs()) || (caduca && ahora > caduca)) {
      almacen.borrar(CLAVE.token);
      almacen.borrar(CLAVE.caduca);
    }
  })();

  /* -------------------------------------------------------------------- */
  /* Estilos de lo que añade este script (usa las variables de cada panel) */
  /* -------------------------------------------------------------------- */
  var css =
    ".acceso-oculto{display:none!important}" +
    ".acceso-2p h1{font-size:1.25rem;margin:0 0 .3rem}" +
    ".acceso-2p p{color:var(--tinta-media,#35617f);font-size:.875rem;margin:0 0 1.25rem}" +
    ".acceso-codigo{font-family:var(--mono,monospace)!important;font-size:1.5rem!important;letter-spacing:.35em;text-align:center}" +
    ".acceso-codigo.rec{font-size:1.05rem!important;letter-spacing:.12em}" +
    ".acceso-2p button.acceso-principal,.reacceso button.acceso-principal{width:100%;margin-top:.35rem}" +
    ".acceso-enlaces{display:flex;justify-content:space-between;gap:.5rem;margin-top:.9rem;flex-wrap:wrap}" +
    "button.acceso-enlace{background:none!important;border:0!important;color:var(--tinta,#06365a)!important;padding:.35rem 0!important;" +
    "min-height:0!important;width:auto!important;margin:0!important;font-weight:500;font-size:.8125rem;text-decoration:underline;text-underline-offset:3px;cursor:pointer}" +
    "button.acceso-enlace:hover{color:#000!important}" +
    ".acceso-msg{margin-top:.8rem;font-size:.8125rem;padding:.6rem .8rem;border-left:3px solid var(--rojo,#a12a2a);background:#fbf1f1;color:var(--rojo,#a12a2a)}" +
    ".acceso-msg:empty{display:none}" +
    ".acceso-msg.bien{border-left-color:var(--verde,#1c6b4b);background:#f0f7f3;color:var(--verde,#1c6b4b)}" +
    ".reacceso{position:fixed;inset:0;z-index:1000;background:rgba(4,36,57,.62);display:flex;align-items:center;justify-content:center;padding:1rem;overflow:auto}" +
    ".reacceso-caja{width:100%;max-width:400px;background:#fff;border:1px solid rgba(6,54,90,.16);padding:2rem 1.6rem;box-shadow:0 18px 50px rgba(4,36,57,.35)}" +
    ".reacceso-caja h1{font-size:1.2rem;margin:0 0 .4rem}" +
    ".reacceso-caja p{color:var(--tinta-media,#35617f);font-size:.875rem;margin:0 0 1.2rem;line-height:1.55}" +
    ".reacceso-caja .campo{margin-bottom:.85rem}" +
    ".reacceso-caja input[readonly]{opacity:.75}" +
    ".aviso-acceso{display:flex;align-items:center;gap:.75rem 1rem;flex-wrap:wrap;margin:0 0 1rem;padding:.7rem .9rem;" +
    "border-left:3px solid var(--ambar,#8a5a12);background:#fdf8ef;font-size:.8125rem;line-height:1.5;color:var(--tinta-oscura,#042439)}" +
    ".aviso-acceso.info{border-left-color:var(--tinta,#06365a);background:var(--piedra-clara,#e6ebed)}" +
    ".aviso-acceso span{flex:1 1 320px}" +
    ".aviso-acceso a{font-weight:600;white-space:nowrap}" +
    ".aviso-acceso button{background:none!important;border:0!important;color:inherit!important;font-size:1.2rem;line-height:1;padding:.2rem .4rem!important;min-height:0!important;width:auto!important;cursor:pointer}" +
    "#panel>.aviso-acceso{margin:1rem 1.25rem}" +
    "#panel.envoltura>.aviso-acceso{margin:0 0 1rem}";
  var estilo = document.createElement("style");
  estilo.textContent = css;
  (document.head || document.documentElement).appendChild(estilo);

  /* -------------------------------------------------------------------- */
  /* Llamadas a /api/admin                                                 */
  /* -------------------------------------------------------------------- */
  function llamar(cuerpo, token) {
    var cabeceras = { "Content-Type": "application/json" };
    if (token) cabeceras.Authorization = "Bearer " + token;
    return fetchOriginal("/api/admin", { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) })
      .then(function (r) {
        return r.text().then(function (texto) {
          var d = null;
          try { d = texto ? JSON.parse(texto) : null; } catch (e) { d = null; }
          if (d === null) {
            throw new Error("El servidor respondió con HTTP " + r.status + " y un contenido que no se esperaba.");
          }
          if (!r.ok) {
            var err = new Error(d.error || "El servidor respondió con HTTP " + r.status);
            err.datos = d;
            err.estado = r.status;
            throw err;
          }
          return d;
        });
      });
  }

  var ultimaMarca = 0, ultimoPing = Date.now();
  function marcarActividad(forzar) {
    var ahora = Date.now();
    if (forzar || ahora - ultimaMarca > 15000) {
      ultimaMarca = ahora;
      almacen.guardar(CLAVE.actividad, String(ahora));
    }
  }

  var estado = { dosPasos: null };

  function guardarSesion(d) {
    almacen.guardar(CLAVE.token, d.token);
    almacen.guardar(CLAVE.usuario, JSON.stringify({ nombre: d.nombre, correo: d.correo }));
    if (d.caduca) almacen.guardar(CLAVE.caduca, String(d.caduca));
    if (d.inactividad) almacen.guardar(CLAVE.inactividad, String(d.inactividad));
    marcarActividad(true);
    ultimoPing = Date.now();
    estado.dosPasos = d.dosPasos;
  }

  var secuencia = 0;
  function elemento(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    return div.firstElementChild;
  }

  /* -------------------------------------------------------------------- */
  /* Paso 2: código de la app o de recuperación                            */
  /* Se dibuja dentro de «caja», ocultando lo que hubiera (salvo el logo). */
  /* Se resuelve con la sesión abierta; se rechaza al pulsar «Volver» (con  */
  /* un error sin texto) o cuando hay que empezar de nuevo (con el motivo). */
  /* -------------------------------------------------------------------- */
  function pedirCodigo(caja, reto) {
    return new Promise(function (resolver, rechazar) {
      var id = "acceso-codigo-" + (++secuencia);
      var modoRec = false, ocupado = false;
      var ocultos = Array.prototype.filter.call(caja.children, function (el) {
        return el.tagName !== "IMG" && !el.classList.contains("acceso-oculto");
      });
      ocultos.forEach(function (el) { el.classList.add("acceso-oculto"); });

      var bloque = elemento(
        '<div class="acceso-2p">' +
          "<h1>Verificación en dos pasos</h1>" +
          '<p class="acceso-2p-texto"></p>' +
          '<div class="campo"><label for="' + id + '"></label>' +
          '<input id="' + id + '" class="acceso-codigo" autocomplete="one-time-code" spellcheck="false" autocapitalize="off"></div>' +
          '<button type="button" class="acceso-principal">Verificar</button>' +
          '<div class="acceso-enlaces">' +
            '<button type="button" class="acceso-enlace" data-a="modo"></button>' +
            '<button type="button" class="acceso-enlace" data-a="volver">Volver</button>' +
          "</div>" +
          '<div class="acceso-msg" role="alert"></div>' +
        "</div>"
      );
      caja.appendChild(bloque);
      var entrada = bloque.querySelector("input");
      var boton = bloque.querySelector(".acceso-principal");
      var aviso = bloque.querySelector(".acceso-msg");

      function pintar() {
        bloque.querySelector(".acceso-2p-texto").textContent = modoRec
          ? "Escriba uno de sus códigos de recuperación. Cada uno sirve una sola vez."
          : "Abra la app de autenticación de su móvil y escriba el código de 6 cifras de JURMIA Abogados.";
        bloque.querySelector("label").textContent = modoRec ? "Código de recuperación" : "Código de 6 cifras";
        bloque.querySelector('[data-a="modo"]').textContent = modoRec ? "Usar el código de la app" : "Usar un código de recuperación";
        entrada.value = "";
        entrada.classList.toggle("rec", modoRec);
        entrada.setAttribute("inputmode", modoRec ? "text" : "numeric");
        entrada.setAttribute("maxlength", modoRec ? "11" : "6");
        entrada.setAttribute("placeholder", modoRec ? "xxxxx-xxxxx" : "");
        aviso.textContent = "";
        setTimeout(function () { entrada.focus(); }, 0);
      }

      function cerrar() {
        bloque.remove();
        ocultos.forEach(function (el) { el.classList.remove("acceso-oculto"); });
      }

      function enviar() {
        if (ocupado) return;
        var codigo = entrada.value.trim();
        if (!codigo) { aviso.textContent = "Escriba el código."; entrada.focus(); return; }
        ocupado = true;
        boton.disabled = true;
        boton.textContent = "Verificando…";
        llamar({ accion: "verificar", reto: reto, codigo: codigo })
          .then(function (d) { cerrar(); resolver(d); })
          .catch(function (e) {
            if (e.datos && e.datos.reiniciar) { cerrar(); rechazar(new Error(e.message)); return; }
            aviso.textContent = e.message;
            entrada.value = "";
            entrada.focus();
          })
          .then(function () {
            ocupado = false;
            boton.disabled = false;
            boton.textContent = "Verificar";
          });
      }

      entrada.addEventListener("input", function () {
        if (modoRec) return;
        var limpio = entrada.value.replace(/\D/g, "").slice(0, 6);
        if (limpio !== entrada.value) entrada.value = limpio;
        if (limpio.length === 6) enviar();
      });
      entrada.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
      boton.addEventListener("click", enviar);
      bloque.querySelector('[data-a="modo"]').addEventListener("click", function () { modoRec = !modoRec; pintar(); });
      bloque.querySelector('[data-a="volver"]').addEventListener("click", function () { cerrar(); rechazar(new Error("")); });
      pintar();
    });
  }

  /* -------------------------------------------------------------------- */
  /* Avisos arriba del panel                                              */
  /* -------------------------------------------------------------------- */
  function avisoSuperior(clase, html, alCerrar) {
    var panel = document.getElementById("panel");
    if (!panel) return;
    var previo = panel.querySelector(".aviso-acceso." + clase);
    if (previo) previo.remove();
    var aviso = elemento('<div class="aviso-acceso ' + clase + '" role="status">' + html +
      '<button type="button" aria-label="Ocultar este aviso">×</button></div>');
    aviso.querySelector("button").addEventListener("click", function () {
      aviso.remove();
      if (alCerrar) alCerrar();
    });
    var primero = panel.firstElementChild;
    if (primero && primero.classList.contains("barra")) primero.insertAdjacentElement("afterend", aviso);
    else panel.insertBefore(aviso, primero);
  }

  function avisoSin2FA() {
    if (EN_SEGURIDAD || estado.dosPasos !== false) return;
    try { if (sessionStorage.getItem("jurmia_aviso_2fa") === "oculto") return; } catch (e) { /* nada */ }
    avisoSuperior("sin-2fa",
      "<span><b>Su cuenta todavía no tiene activada la verificación en dos pasos.</b> Sin ella, basta la " +
      "contraseña para entrar en el panel. Se activa en un minuto con Google Authenticator o Microsoft Authenticator.</span>" +
      '<a href="/admin/seguridad">Activarla ahora</a>',
      function () { try { sessionStorage.setItem("jurmia_aviso_2fa", "oculto"); } catch (e) { /* nada */ } });
  }

  function despuesDeEntrar(d) {
    // El panel abre la vista justo después; se espera a que exista
    setTimeout(function () {
      if (typeof d.codigosRestantes === "number") {
        avisoSuperior("info",
          "<span><b>Ha entrado con un código de recuperación.</b> Le quedan " + d.codigosRestantes +
          ". Si ha perdido o cambiado de móvil, vaya a Seguridad, desactive la verificación y vuelva a activarla con el nuevo.</span>" +
          '<a href="/admin/seguridad">Ir a Seguridad</a>');
      }
      avisoSin2FA();
    }, 0);
  }

  /* -------------------------------------------------------------------- */
  /* Entrada y salida                                                      */
  /* -------------------------------------------------------------------- */
  function entrar(correo, clave) {
    return llamar({ accion: "entrar", correo: correo, clave: clave })
      .then(function (d) {
        if (!d.dosPasos || !d.reto) return d;
        var campo = document.getElementById("clave");
        if (campo) campo.value = "";
        var caja = document.querySelector("#acceso .tarjeta-acceso");
        return caja ? pedirCodigo(caja, d.reto) : pedirEnVentana(d.reto);
      })
      .then(function (d) {
        guardarSesion(d);
        despuesDeEntrar(d);
        return d;
      });
  }

  function salir() {
    var t = almacen.leer(CLAVE.token);
    var fin = function () {
      [CLAVE.token, CLAVE.usuario, CLAVE.caduca].forEach(almacen.borrar);
      location.reload();
    };
    if (!t) { fin(); return Promise.resolve(); }
    return llamar({ accion: "salir" }, t).catch(function () { /* se sale igualmente */ }).then(fin);
  }

  function yo() {
    var t = almacen.leer(CLAVE.token);
    if (!t) return Promise.reject(new Error("Sin sesión"));
    ultimoPing = Date.now();
    // Por el fetch envuelto: si la sesión ha caducado, se pide de nuevo la contraseña
    return window.fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
      body: JSON.stringify({ accion: "yo" })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
        estado.dosPasos = d.dosPasos;
        if (d.inactividad) almacen.guardar(CLAVE.inactividad, String(d.inactividad));
        if (d.caduca) almacen.guardar(CLAVE.caduca, String(d.caduca));
        return d;
      });
    });
  }

  /* -------------------------------------------------------------------- */
  /* Volver a identificarse sin perder lo que hay en pantalla              */
  /* -------------------------------------------------------------------- */
  var enCurso = null;

  function ventana(html) {
    var fondo = elemento('<div class="reacceso" role="dialog" aria-modal="true">' +
      '<div class="reacceso-caja tarjeta-acceso">' + html + "</div></div>");
    document.body.appendChild(fondo);
    return fondo;
  }

  function pedirEnVentana(reto) {
    var fondo = ventana("");
    return pedirCodigo(fondo.firstElementChild, reto).then(
      function (d) { fondo.remove(); return d; },
      function (e) { fondo.remove(); throw e; }
    );
  }

  function mostrarReacceso() {
    return new Promise(function (resolver, rechazar) {
      var u = usuarioGuardado();
      var n = ++secuencia;
      var fondo = ventana(
        '<h1 id="reacceso-t' + n + '">Vuelva a identificarse</h1>' +
        "<p>Por seguridad, la sesión se ha cerrado (" + Math.round(inactividadMs() / 60000) +
        " minutos sin actividad, 12 horas desde que entró o se cerró desde otro dispositivo). " +
        "Lo que tenía en pantalla sigue aquí: identifíquese y el panel continuará donde lo dejó.</p>" +
        '<div class="campo"><label for="reacceso-correo' + n + '">Correo electrónico</label>' +
        '<input type="email" id="reacceso-correo' + n + '" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"></div>' +
        '<div class="campo"><label for="reacceso-clave' + n + '">Contraseña</label>' +
        '<input type="password" id="reacceso-clave' + n + '" autocomplete="current-password"></div>' +
        '<button type="button" class="acceso-principal">Entrar</button>' +
        '<div class="acceso-enlaces"><span></span><button type="button" class="acceso-enlace" data-a="salir">Salir del panel</button></div>' +
        '<div class="acceso-msg" role="alert"></div>'
      );
      fondo.setAttribute("aria-labelledby", "reacceso-t" + n);
      var caja = fondo.firstElementChild;
      var correo = caja.querySelector('input[type="email"]');
      var clave = caja.querySelector('input[type="password"]');
      var boton = caja.querySelector(".acceso-principal");
      var aviso = caja.querySelector(".acceso-msg");
      var terminado = false;

      if (u && u.correo) {
        correo.value = u.correo;
        correo.readOnly = true;
        setTimeout(function () { clave.focus(); }, 0);
      } else {
        setTimeout(function () { correo.focus(); }, 0);
      }

      function terminar(ok, valor) {
        if (terminado) return;
        terminado = true;
        window.removeEventListener("storage", alCambiarOtraPestana);
        fondo.remove();
        if (ok) resolver(valor); else rechazar(valor);
      }

      // Si se identifica en otra pestaña, esta sigue sola
      function alCambiarOtraPestana(e) {
        if (e.key === CLAVE.token && e.newValue && FORMATO_TOKEN.test(e.newValue)) terminar(true);
      }
      window.addEventListener("storage", alCambiarOtraPestana);

      function enviar() {
        if (boton.disabled) return;
        aviso.textContent = "";
        if (!correo.value.trim() || !clave.value) { aviso.textContent = "Escriba su correo y su contraseña."; return; }
        boton.disabled = true;
        llamar({ accion: "entrar", correo: correo.value.trim(), clave: clave.value })
          .then(function (d) {
            clave.value = "";
            return d.dosPasos && d.reto ? pedirCodigo(caja, d.reto) : d;
          })
          .then(function (d) {
            if (u && u.correo && d.correo !== u.correo) {
              // No debería pasar (el correo no se puede cambiar), pero por si acaso
              guardarSesion(d);
              location.reload();
              return;
            }
            guardarSesion(d);
            despuesDeEntrar(d);
            terminar(true);
          })
          .catch(function (e) { if (e.message) aviso.textContent = e.message; })
          .then(function () { boton.disabled = false; });
      }

      boton.addEventListener("click", enviar);
      clave.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); enviar(); } });
      correo.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clave.focus(); } });
      caja.querySelector('[data-a="salir"]').addEventListener("click", function () {
        [CLAVE.token, CLAVE.usuario, CLAVE.caduca].forEach(almacen.borrar);
        terminar(false, new Error("Ha salido del panel."));
        location.reload();
      });
    });
  }

  function reautenticar() {
    if (enCurso) return enCurso;
    enCurso = mostrarReacceso();
    var fin = function () { enCurso = null; };
    enCurso.then(fin, fin);
    return enCurso;
  }

  /* -------------------------------------------------------------------- */
  /* fetch envuelto: siempre con el token más reciente, y si la sesión ha  */
  /* caducado, se vuelve a identificar y se repite la petición.            */
  /* -------------------------------------------------------------------- */
  function esApiPropia(url) {
    try {
      var u = new URL(url, location.href);
      return u.origin === location.origin && u.pathname.indexOf("/api/") === 0;
    } catch (e) {
      return false;
    }
  }

  function conTokenActual(opciones) {
    if (!opciones || !opciones.headers) return { op: opciones, llevaba: false };
    var h = opciones.headers, token = almacen.leer(CLAVE.token), llevaba = false, nuevas;
    var esBearer = function (v) { return String(v || "").indexOf("Bearer ") === 0; };
    if (typeof Headers !== "undefined" && h instanceof Headers) {
      nuevas = new Headers(h);
      if (esBearer(nuevas.get("Authorization"))) {
        llevaba = true;
        if (token) nuevas.set("Authorization", "Bearer " + token);
      }
    } else if (Array.isArray(h)) {
      nuevas = h.map(function (par) {
        if (String(par[0]).toLowerCase() === "authorization" && esBearer(par[1])) {
          llevaba = true;
          return token ? [par[0], "Bearer " + token] : par;
        }
        return par;
      });
    } else {
      nuevas = {};
      Object.keys(h).forEach(function (k) {
        var v = h[k];
        if (k.toLowerCase() === "authorization" && esBearer(v)) {
          llevaba = true;
          if (token) v = "Bearer " + token;
        }
        nuevas[k] = v;
      });
    }
    return { op: Object.assign({}, opciones, { headers: nuevas }), llevaba: llevaba };
  }

  window.fetch = function (entrada, opciones) {
    if (typeof entrada !== "string" || !esApiPropia(entrada)) return fetchOriginal(entrada, opciones);
    var p = conTokenActual(opciones);
    if (!p.llevaba) return fetchOriginal(entrada, opciones);
    return fetchOriginal(entrada, p.op).then(function (r) {
      if (r.status !== 401) {
        if (r.ok) marcarActividad();
        return r;
      }
      return reautenticar().then(
        function () { return fetchOriginal(entrada, conTokenActual(opciones).op); },
        function () { return r; }
      );
    });
  };

  /* -------------------------------------------------------------------- */
  /* Mientras se trabaja, la sesión se mantiene viva                       */
  /* -------------------------------------------------------------------- */
  function alActividad() {
    marcarActividad();
    if (enCurso || !almacen.leer(CLAVE.token)) return;
    if (Date.now() - ultimoPing > PING_MS) yo().catch(function () { /* el aviso ya lo da el fetch */ });
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, alActividad, { passive: true, capture: true });
  });

  /* -------------------------------------------------------------------- */
  /* Arranque                                                              */
  /* -------------------------------------------------------------------- */
  function iniciar() {
    // Con la pantalla de acceso a la vista, se rellena el correo de la última vez
    var u = usuarioGuardado();
    var correo = document.getElementById("correo");
    var acceso = document.getElementById("acceso");
    if (u && u.correo && correo && !correo.value && acceso && !acceso.classList.contains("oculto") && !almacen.leer(CLAVE.token)) {
      correo.value = u.correo;
      var clave = document.getElementById("clave");
      if (clave) clave.focus();
    }
    // Con sesión guardada: se comprueba, se renueva y se mira si falta la 2FA
    if (almacen.leer(CLAVE.token)) {
      yo().then(function () { setTimeout(avisoSin2FA, 0); }).catch(function () { /* nada */ });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  window.JurmiaAcceso = {
    entrar: entrar,
    salir: salir,
    yo: yo,
    token: function () { return almacen.leer(CLAVE.token); },
    usuario: usuarioGuardado,
    reautenticar: reautenticar
  };
})();
