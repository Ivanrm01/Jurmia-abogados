/* JURMIA Abogados — comportamiento de la página */

(function () {
  "use strict";


  /* --- barra fija de acciones en móvil -----------------------------------
     Cambie estos tres datos y la barra queda lista.
     El teléfono va sin espacios y con prefijo internacional.
     El de WhatsApp, igual pero sin el signo +.                            */
  var TELEFONO = "+34000000000";
  var WHATSAPP = "34000000000";
  var TEXTO_WHATSAPP = "Hola, me gustaría plantear una consulta jurídica.";

  (function barraMovil() {
    if (document.body.classList.contains("sin-barra-movil")) return;
    if (document.querySelector(".barra-movil")) return;

    var iconos = {
      telefono: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
      whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 20.5l1.8-5.3A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.8 9.2c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.7 1.6c0 .2 0 .4-.1.5l-.4.5c-.2.2-.3.3-.1.6a6 6 0 0 0 2.7 2.3c.3.1.4 0 .6-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.2.1.4.2.4.4v.6c-.1.4-.7 1-1.2 1.1-.4.1-1 .2-2.7-.5a9.4 9.4 0 0 1-4-3.6c-.3-.5-.8-1.4-.8-2.4 0-1 .5-1.4.7-1.6z"/></svg>',
      consulta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/></svg>'
    };

    var barra = document.createElement("nav");
    barra.className = "barra-movil";
    barra.setAttribute("aria-label", "Contacto rápido");
    barra.innerHTML =
      '<div class="barra-movil-fila">' +
        '<a href="tel:' + TELEFONO + '" data-accion="llamar">' + iconos.telefono + "<span>Llamar</span></a>" +
        '<a href="https://wa.me/' + WHATSAPP + "?text=" + encodeURIComponent(TEXTO_WHATSAPP) +
          '" target="_blank" rel="noopener" data-accion="whatsapp">' + iconos.whatsapp + "<span>WhatsApp</span></a>" +
        '<a class="destacada" href="/#contacto" data-accion="consulta">' + iconos.consulta + "<span>Consulta</span></a>" +
      "</div>";

    document.body.appendChild(barra);
    document.body.classList.add("con-barra-movil");
  })();

  /* --- año en el pie --- */
  var anio = document.getElementById("anio");
  if (anio) anio.textContent = new Date().getFullYear();

  /* --- menú en móvil --- */
  var boton = document.getElementById("abrir-menu");
  var nav = document.getElementById("navegacion");
  if (boton && nav) {
    boton.addEventListener("click", function () {
      var abierto = nav.classList.toggle("abierta");
      boton.setAttribute("aria-expanded", String(abierto));
      boton.textContent = abierto ? "Cerrar" : "Menú";
    });
    document.addEventListener("click", function (e) {
      if (!nav.classList.contains("abierta")) return;
      if (nav.contains(e.target) || boton.contains(e.target)) return;
      nav.classList.remove("abierta");
      boton.setAttribute("aria-expanded", "false");
      boton.textContent = "Menú";
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && nav.classList.contains("abierta")) {
        nav.classList.remove("abierta");
        boton.setAttribute("aria-expanded", "false");
        boton.textContent = "Menú";
      }
    });
  }

  /* --- línea inferior de la cabecera al hacer scroll --- */
  var cabecera = document.getElementById("cabecera");
  if (cabecera) {
    var marcarCabecera = function () {
      cabecera.classList.toggle("fijada", window.scrollY > 8);
    };
    marcarCabecera();
    window.addEventListener("scroll", marcarCabecera, { passive: true });
  }

  /* --- revelado al entrar en pantalla --- */
  var reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revelables = document.querySelectorAll(".revelar");
  if (reducido || !("IntersectionObserver" in window)) {
    revelables.forEach(function (el) { el.classList.add("visible"); });
  } else {
    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add("visible");
          observador.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revelables.forEach(function (el) { observador.observe(el); });
  }

  /* --- los enlaces "Consultar un asunto X" preseleccionan el área --- */
  var selectArea = document.getElementById("area");
  document.querySelectorAll("[data-area]").forEach(function (enlace) {
    enlace.addEventListener("click", function () {
      if (!selectArea) return;
      selectArea.value = enlace.getAttribute("data-area");
    });
  });

  /* --- envío del formulario --- */
  var form = document.getElementById("formulario-consulta");
  var aviso = document.getElementById("aviso-envio");
  var botonEnviar = document.getElementById("boton-enviar");

  function mostrarAviso(texto, esError) {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.classList.add("visible");
    aviso.classList.toggle("error", Boolean(esError));
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var datos = Object.fromEntries(new FormData(form).entries());
      botonEnviar.disabled = true;
      botonEnviar.textContent = "Enviando…";

      fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
      })
        .then(function (r) {
          return r.json().then(function (cuerpo) {
            return { ok: r.ok, cuerpo: cuerpo };
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error(res.cuerpo && res.cuerpo.error);
          form.reset();
          mostrarAviso("Consulta enviada. Le respondemos en un plazo de 24 horas laborables.", false);
        })
        .catch(function () {
          mostrarAviso(
            "No hemos podido enviar la consulta. Escríbanos a info@jurmiabogados.es o llámenos y la atendemos igual.",
            true
          );
        })
        .then(function () {
          botonEnviar.disabled = false;
          botonEnviar.textContent = "Enviar consulta";
        });
    });
  }
})();
