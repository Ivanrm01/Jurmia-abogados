/**
 * Pruebas del módulo de Ley de Segunda Oportunidad.
 *
 *   npm test
 *
 * Todos los nombres, DNI y entidades son ficticios.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import "../assets/js/lso-motor.js";
import "../assets/js/lso-escritos.js";

const M = globalThis.MotorLSO;
const E = globalThis.EscritosLSO;

const base = {
  perfil: "asalariado",
  deuda: "30_60",
  acreedores: "4_6",
  tipos: ["tarjetas", "prestamos"],
  capacidad: "no_puedo_pagar",
  ingresos: "1000_1500",
  bienes: ["ninguno"],
  embargos: "si",
  condena: "no",
  sancion: "no",
  derivacion: "no",
  exoneracionPrevia: "no",
};

describe("test de viabilidad", () => {
  it("un caso típico de tarjetas encaja y es prioritario", () => {
    const r = M.evaluar(base);
    assert.equal(r.encaje, "alto");
    assert.equal(r.prioridad, "caliente");
    assert.equal(r.via, "sin_masa");
    assert.ok(r.puntuacion >= 70);
  });

  it("una condena por delito económico obliga a estudiar el caso", () => {
    const r = M.evaluar({ ...base, condena: "si" });
    assert.equal(r.encaje, "estudio");
    assert.equal(r.prioridad, "frio");
    assert.ok(r.puntos.some((p) => p.tipo === "bloqueo"));
  });

  it("quien quiere conservar la vivienda va a plan de pagos", () => {
    const r = M.evaluar({ ...base, bienes: ["vivienda_hipoteca"], conservarVivienda: "si" });
    assert.equal(r.via, "plan_pagos");
  });

  it("un autónomo en activo va al procedimiento de microempresas", () => {
    assert.equal(M.evaluar({ ...base, perfil: "autonomo" }).via, "microempresa");
  });

  it("deuda pequeña y un solo acreedor no encaja bien", () => {
    assert.equal(M.evaluar({ ...base, deuda: "lt5", acreedores: "1", embargos: "no" }).encaje, "estudio");
  });

  it("avisa de los límites del crédito público y de la reclamación revolving", () => {
    const r = M.evaluar({ ...base, tipos: ["tarjetas", "hacienda"] });
    assert.ok(r.puntos.some((p) => p.texto.includes("10.000 €")));
    assert.ok(r.puntos.some((p) => p.texto.includes("revolving")));
  });

  it("valida y normaliza las respuestas recibidas por la API", () => {
    assert.equal(M.validarRespuestas(base), true);
    assert.equal(M.validarRespuestas({ ...base, deuda: "muchisimo" }), false);
    assert.equal(M.validarRespuestas({ ...base, tipos: [] }), false);
    const { derivacion, ...sinDerivacion } = base;
    assert.equal(M.validarRespuestas(sinDerivacion), true);
    const n = M.normalizarRespuestas({ ...sinDerivacion, intruso: "x" });
    assert.equal(n.derivacion, "no");
    assert.equal(n.intruso, undefined);
  });

  it("lee la tarifa de honorarios del entorno", () => {
    const t = M.leerTarifas("sin_masa:2000, plan_pagos:4100, raro:1");
    assert.equal(t.sin_masa, 2000);
    assert.equal(t.plan_pagos, 4100);
    assert.equal(t.liquidacion, M.TARIFAS_EJEMPLO.liquidacion);
    assert.equal(M.evaluar(base, t).honorariosEstimados, 2000);
  });

  it("pide más documentos a un autónomo con vivienda", () => {
    const simple = M.documentosRequeridos(base).length;
    const complejo = M.documentosRequeridos({ ...base, perfil: "exautonomo", bienes: ["vivienda_hipoteca"], tipos: ["hipoteca"] }).length;
    assert.ok(complejo > simple);
    const pend = M.documentosPendientes(base, { dni: { estado: "validado" }, cirbe: { estado: "rechazado" } });
    assert.equal(pend.find((d) => d.id === "dni"), undefined);
    assert.ok(pend.find((d) => d.id === "cirbe"));
  });

  it("formatea importes con separador de miles", () => {
    assert.match(M.euros(5000), /^5\.000\s€$/);
    assert.match(M.euros(1234.5), /^1\.234,50\s€$/);
  });
});

describe("plazos procesales", () => {
  it("calcula la Pascua", () => {
    assert.equal(M.domingoPascua(2026), "2026-04-05");
    assert.equal(M.domingoPascua(2027), "2027-03-28");
    assert.equal(M.motivoInhabil("2027-03-26"), "Viernes Santo");
  });

  it("concurso sin masa: 15 días para los acreedores y 10 para pedir la exoneración", () => {
    const acreedores = M.calcularPlazo("2026-10-16", 15, "publicacion", "art. 37 ter");
    assert.equal(acreedores.inicio, "2026-10-19");
    assert.equal(acreedores.vence, "2026-11-06");
    const exon = M.calcularPlazo(acreedores.vence, 10, "fecha", "art. 501.1");
    assert.equal(exon.vence, "2026-11-20");
    assert.equal(exon.gracia, "2026-11-23");
  });

  it("agosto no cuenta", () => {
    // Recepción en LexNET el viernes 24 de julio: notificado el 25, el plazo empieza el lunes 27.
    const p = M.calcularPlazo("2026-07-24", 10, "lexnet", "prueba");
    assert.equal(p.inicio, "2026-07-27");
    assert.equal(p.vence, "2026-09-07");
  });

  it("del 24 de diciembre al 6 de enero no cuenta", () => {
    assert.equal(M.calcularPlazo("2026-12-18", 5, "lexnet", "prueba").vence, "2027-01-08");
  });

  it("festivos locales configurados", () => {
    assert.equal(M.calcularPlazo("2026-10-16", 1, "publicacion", "x").vence, "2026-10-19");
    assert.equal(M.calcularPlazo("2026-10-16", 1, "publicacion", "x", { festivosExtra: ["2026-10-19"] }).vence, "2026-10-20");
  });

  it("cuenta los días hábiles que quedan y resta hábiles", () => {
    assert.equal(M.habilesRestantes("2026-10-16", "2026-10-23"), 5);
    assert.equal(M.habilesRestantes("2026-10-23", "2026-10-16"), -5);
    assert.equal(M.restarHabiles("2026-10-19", 2), "2026-10-15");
  });
});

const ac = (x) => ({ concepto: "Deuda", ...x });

describe("exoneración del crédito público (art. 489 TRLC y STS 264/2026)", () => {
  it("aplica el límite de 5.000 € íntegros y 50 % hasta 10.000 €", () => {
    assert.equal(M.exonerablePublico(4000), 4000);
    assert.equal(M.exonerablePublico(9000), 7000);
    assert.equal(M.exonerablePublico(15000), 10000);
    assert.equal(M.exonerablePublico(40000), 10000);
  });

  it("los recargos son exonerables y el límite va por acreedor", () => {
    const r = M.calcularExoneracion([
      ac({ id: "1", nombre: "AEAT", nif: "Q0000000A", tipo: "aeat", principal: 8000, accesorios: 1500 }),
      ac({ id: "2", nombre: "AEAT", nif: "Q0000000A", tipo: "aeat", principal: 8000 }),
      ac({ id: "3", nombre: "TGSS", tipo: "tgss", principal: 4000, accesorios: 800 }),
      ac({ id: "4", nombre: "Ayuntamiento", tipo: "administracion", principal: 1200 }),
      ac({ id: "5", nombre: "Banco", tipo: "banco", principal: 20000, accesorios: 2000 }),
    ]);
    const aeat = r.publicos.find((p) => p.clave === "Q0000000A");
    assert.equal(aeat.principal, 16000);
    assert.equal(aeat.exonerable, 10000);
    const exAeat = r.porAcreedor.filter((c) => c.acreedor.nif === "Q0000000A").reduce((s, c) => s + c.exonerable, 0);
    assert.equal(exAeat, 11500);
    assert.equal(r.porAcreedor.find((c) => c.acreedor.id === "3").exonerable, 4800);
    assert.equal(r.porAcreedor.find((c) => c.acreedor.id === "5").exonerable, 22000);
    assert.equal(r.noExonerable, 6000);
  });

  it("sin crédito público exonerable si hubo exoneración previa", () => {
    const r = M.calcularExoneracion([ac({ id: "1", nombre: "AEAT", tipo: "aeat", principal: 3000, accesorios: 500 })], { exoneracionPrevia: true });
    assert.equal(r.exonerable, 0);
  });

  it("la parte con garantía real no se exonera y los alimentos tampoco", () => {
    const r = M.calcularExoneracion([
      ac({ id: "1", nombre: "Banco", tipo: "banco", principal: 100000, garantia: "hipoteca", importeGarantizado: 90000 }),
      ac({ id: "2", nombre: "Excónyuge", tipo: "particular", principal: 3000, noExonerable: "Pensión de alimentos" }),
    ]);
    assert.equal(r.porAcreedor[0].exonerable, 10000);
    assert.equal(r.porAcreedor[1].exonerable, 0);
  });
});

describe("formato de los escritos", () => {
  it("reconoce títulos, tablas, listas y huecos", () => {
    const b = E.analizar("# HECHOS\n## PRIMERO.- Algo\nTexto con [[dato]].\n| A | B |\n|---|---|\n| 1 | 2 |\n- uno\n- dos\n>> En Madrid");
    assert.deepEqual(b.map((x) => x.t), ["titulo", "apartado", "parrafo", "tabla", "lista", "derecha"]);
    assert.equal(b[3].cabecera, true);
    assert.deepEqual(b[3].filas, [["A", "B"], ["1", "2"]]);
    assert.deepEqual(E.pendientes("[[a]] y [[b]] y [[a]]"), ["a", "b"]);
    assert.deepEqual(E.enLinea("**Hola [[x]]** y *cita*"), [
      { texto: "Hola ", negrita: true },
      { texto: "x", negrita: true, pendiente: true },
      { texto: " y " },
      { texto: "cita", cursiva: true },
    ]);
  });
});

/** Expediente ficticio con concurso sin masa declarado y edicto publicado. */
function expedienteDePrueba(extra = {}) {
  const respuestas = { ...base, tipos: ["tarjetas", "hacienda"] };
  return {
    id: "S261001-PRUE",
    tipo: "lso",
    creado: "2026-06-01T10:00:00Z",
    fase: "concurso",
    cliente: { nombre: "Persona Ficticia Prueba", telefono: "600000000", email: "prueba@example.com", provincia: "Valencia" },
    respuestas,
    resultado: M.evaluar(respuestas),
    despacho: { letrado: "Letrada A", colegiado: "0000", colegio: "Ejemplo", procurador: "Procuradora A", festivos: [] },
    judicial: {
      tratamiento: "D.ª",
      dni: "00000001R",
      domicilio: "Calle Ejemplo, 1",
      codigoPostal: "46001",
      municipio: "Valencia",
      estadoCivil: "casado",
      regimen: "gananciales",
      conyuge: "D. Cónyuge Ficticio",
      fechaMatrimonio: "2010-05-01",
      ingresosMensuales: 1300,
      gastosMensuales: 1100,
      sede: "Valencia",
      plaza: "2",
      autos: "Concurso de acreedores n.º 100/2026",
      via: "sin_masa",
      hitos: { autoDeclaracion: "2026-09-20", sinMasa: true, edictoBOE: "2026-10-16" },
    },
    acreedores: [
      ac({ id: "a1", nombre: "Banco Alfa, S.A.", tipo: "banco", principal: 20000, procedimiento: { organo: "Tribunal de Instancia de Valencia, Sección Civil, Plaza n.º 4", autos: "Ejecución 1/2026", estado: "Embargo de nómina" } }),
      ac({ id: "a2", nombre: "Agencia Estatal de Administración Tributaria", tipo: "aeat", principal: 12000, accesorios: 2000 }),
    ],
    bienes: [],
    escritos: {},
    ...extra,
  };
}

describe("generación de escritos", () => {
  const ahora = new Date("2026-11-02T10:00:00Z");

  it("genera todos los escritos sin restos de datos indefinidos", () => {
    const e = expedienteDePrueba();
    for (const def of E.CATALOGO) {
      const refId = def.tipo === "suspension_ejecucion" ? "a1" : undefined;
      const { contenido } = E.generarEscrito(def.tipo, e, ahora, refId);
      assert.doesNotMatch(contenido, /undefined|NaN|\[object|null/, def.tipo);
      assert.ok(contenido.length > 200, def.tipo);
    }
  });

  it("también con un expediente dado de alta a mano, sin test ni datos", () => {
    const e = { id: "S0", fase: "contratado", cliente: { nombre: "Sin Datos" } };
    for (const def of E.CATALOGO) {
      const { contenido } = E.generarEscrito(def.tipo, e, ahora);
      assert.doesNotMatch(contenido, /undefined|NaN|\[object|null/, def.tipo);
    }
    assert.ok(E.escritosDelExpediente(e, ahora).length > 0);
  });

  it("la solicitud va a la Sección de lo Mercantil y pide concurso sin masa", () => {
    const { contenido } = E.generarEscrito("solicitud_concurso", expedienteDePrueba(), ahora);
    assert.ok(contenido.includes("AL TRIBUNAL DE INSTANCIA DE VALENCIA, SECCIÓN DE LO MERCANTIL"));
    assert.ok(contenido.includes("37 bis"));
    assert.ok(contenido.includes("D.ª PERSONA FICTICIA PRUEBA"));
    assert.ok(contenido.includes("mi representada"));
    assert.ok(contenido.includes("Letrada A"));
  });

  it("la exoneración identifica el crédito público y cita la STS 264/2026", () => {
    const { contenido } = E.generarEscrito("exoneracion_sin_masa", expedienteDePrueba(), ahora);
    assert.ok(contenido.includes("ECLI:ES:TS:2026:440"));
    assert.match(contenido, /8\.500,00\s€/); // 5.000 + 3.500 de principal exonerable
  });

  it("calcula el plazo de la exoneración sin masa y lo marca pendiente", () => {
    const n = E.escritosDelExpediente(expedienteDePrueba(), ahora);
    const exon = n.find((x) => x.def.tipo === "exoneracion_sin_masa");
    assert.equal(exon.plazo.vence, "2026-11-20");
    assert.equal(exon.restantes, 14);
    assert.ok(n.some((x) => x.def.tipo === "suspension_ejecucion" && x.refId === "a1"));
    assert.ok(!n.some((x) => x.def.tipo === "plan_pagos"));
  });

  it("avisa del plazo dos días hábiles antes y lo retira al presentar", () => {
    const e = expedienteDePrueba();
    const [aviso] = E.avisosDePlazo(e, ahora);
    assert.equal(aviso.tipo, "exoneracion_sin_masa");
    assert.equal(aviso.aviso, "2026-11-18");
    e.escritos = { exoneracion_sin_masa: { tipo: "exoneracion_sin_masa", estado: "presentado" } };
    assert.equal(E.avisosDePlazo(e, ahora).length, 0);
  });

  it("los festivos locales del despacho alargan el plazo", () => {
    const e = expedienteDePrueba();
    e.despacho.festivos = "2026-11-09";
    const exon = E.escritosDelExpediente(e, ahora).find((x) => x.def.tipo === "exoneracion_sin_masa");
    assert.equal(exon.plazo.vence, "2026-11-23");
  });

  it("las provincias del formulario y las sedes coinciden", () => {
    assert.deepEqual([...M.PROVINCIAS].sort(), Object.keys(E.SEDES).sort());
  });

  it("propone la sede por la provincia del cliente", () => {
    assert.equal(E.sedePorProvincia("Castellón"), "Castellón de la Plana");
    const j = E.judicialInicial({ cliente: { provincia: "Madrid" }, resultado: { via: "liquidacion" } });
    assert.equal(j.sede, "Madrid");
    assert.equal(j.via, "liquidacion");
  });
});

describe("calculadora: cuánto se podría cancelar", () => {
  it("cancela lo privado y aplica el límite público por administración", () => {
    const e = M.estimarCancelacion({ privadas: "30.000", hacienda: 9000, haciendaRecargos: 1500, tgss: 4000 });
    assert.equal(e.total, 44500);
    assert.equal(e.cancelable, 30000 + 7000 + 1500 + 4000);
    assert.equal(e.lineas.find((l) => l.id === "hacienda").estado, "parcial");
    assert.equal(e.lineas.find((l) => l.id === "tgss").estado, "si");
  });

  it("la parte de la hipoteca cubierta por la vivienda y los alimentos no se cancelan", () => {
    const e = M.estimarCancelacion({ hipoteca: 100000, valorVivienda: 90000, alimentos: 3000, embargoMensual: 300 });
    assert.equal(e.lineas.find((l) => l.id === "hipoteca").cancelable, 10000);
    assert.equal(e.lineas.find((l) => l.id === "alimentos").estado, "no");
    assert.equal(e.perdidaEspera, 1800);
  });

  it("lee importes escritos a la española", () => {
    assert.equal(M.estimarCancelacion({ privadas: "1.234,56" }).total, 1234.56);
    assert.equal(M.estimarCancelacion({ privadas: "2.500.000" }).total, 2500000);
    assert.equal(M.estimarCancelacion({ privadas: "-50" }).total, 0);
  });

  it("deduce respuestas del test a partir de la calculadora", () => {
    const r = M.respuestasDesdeCalculo(M.estimarCancelacion({ privadas: 20000, tgss: 3000, embargoMensual: 200 }));
    assert.equal(r.deuda, "15_30");
    assert.deepEqual(r.tipos, ["tarjetas", "prestamos", "seguridad_social"]);
    assert.equal(r.embargos, "si");
  });

  it("hay hoja de ruta para cada vía y semáforo para cada tipo de deuda", () => {
    Object.keys(M.VIAS).forEach((v) => assert.ok(M.HOJA_DE_RUTA[v] && M.HOJA_DE_RUTA[v].length >= 3, v));
    M.PREGUNTAS.find((p) => p.id === "tipos").opciones.forEach((o) => assert.ok(M.SEMAFORO_TIPOS[o.valor], o.valor));
  });
});
