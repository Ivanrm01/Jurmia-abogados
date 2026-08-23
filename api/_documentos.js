/**
 * Generación de documentos del expediente.
 *
 * Todos los escritos salen del mismo expediente, de modo que el importe, la
 * distancia y la causa alegada son coherentes entre la reclamación
 * extrajudicial, el escrito ante AESA y la demanda.
 *
 * Los escritos son borradores de trabajo. Llevan marcadores entre corchetes en
 * todo aquello que el letrado debe completar o verificar, y no se inventa
 * ninguna cita: la jurisprudencia que se desarrolla es la del Tribunal de
 * Justicia de la Unión Europea, que es la que fija la doctrina en esta materia.
 */

import "../assets/js/aeropuertos.js";
import "../assets/js/vuelos-motor.js";

const M = globalThis.MotorVuelos;

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const eur = (n) =>
  (Number(n) || 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const fechaLarga = (iso) => {
  if (!iso) return "[FECHA]";
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
  if (isNaN(d.getTime())) return "[FECHA]";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
};

const hoy = () => fechaLarga(new Date().toISOString().slice(0, 10));

const oBien = (v, alternativa) => (v && String(v).trim() ? String(v).trim() : alternativa);

function nombreIncidencia(id) {
  const i = (M.INCIDENCIAS || []).find((x) => x.id === id);
  return i ? i.etiqueta.toLowerCase() : "incidencia";
}

/** Relato de los hechos, común a todos los escritos. */
function relato(e) {
  const c = e.caso || {}, v = e.vuelo || {};
  const min = M.formatoMinutos(c.minutos || 0);
  switch (c.incidencia) {
    case "cancelacion":
      return "el vuelo fue cancelado por el transportista, comunicándose la cancelación con " +
        (c.avisoDias || 0) + " días de antelación respecto de la fecha prevista de salida";
    case "embarque":
      return "se denegó el embarque a los pasajeros contra su voluntad, pese a haberse presentado " +
        "en facturación dentro del plazo exigido y disponer de reserva confirmada";
    case "enlace":
      return "el retraso acumulado en el primer segmento provocó la pérdida de la conexión, " +
        "de modo que los pasajeros alcanzaron el destino final con un retraso de " + min +
        ", constando ambos trayectos amparados por una única reserva";
    case "downgrade":
      return "los pasajeros fueron acomodados en una clase inferior a la contratada";
    default:
      return "la aeronave alcanzó el destino final con un retraso de " + min +
        " sobre la hora programada de llegada";
  }
}

function bloqueVerificacion(e) {
  const w = e.verificacion;
  if (!w || !w.encontrado) return "";
  return "\n\nLa hora real de llegada consta acreditada por los registros públicos de seguimiento " +
    "aéreo (red ADS-B de OpenSky Network), que sitúan el último contacto con la aeronave, " +
    "indicativo " + w.indicativo + ", el " + w.aterrizajeLocal + " en hora local del aeropuerto de " +
    "destino. Debe advertirse que dicho registro corresponde al final del rodaje, por lo que la " +
    "apertura de puertas, que es el momento relevante conforme a la sentencia Germanwings que " +
    "más adelante se desarrolla, fue necesariamente posterior.";
}

/* ------------------------------------------------------------------ */
/* 1. Reclamación extrajudicial (y primer intento de negociación)      */
/* ------------------------------------------------------------------ */

export function reclamacionExtrajudicial(e) {
  const v = e.vuelo || {}, c = e.caso || {}, r = e.calculo || {}, d = e.despacho || {};
  const cliente = e.cliente || {};
  const total = r.importeTotal || 0;

  return `${oBien(d.nombre, "[DESPACHO]")}
${oBien(d.domicilio, "[DOMICILIO PROFESIONAL]")}
${oBien(d.email, "[CORREO ELECTRÓNICO]")}

A la atención del Servicio de Atención al Cliente de ${oBien(v.aerolinea, "[AEROLÍNEA]")}

ASUNTO: reclamación de compensación al amparo del Reglamento (CE) 261/2004.
Vuelo ${oBien(v.numero, "[Nº DE VUELO]")}, de ${fechaLarga(v.fecha)}, ruta ${oBien(v.origen, "[ORIGEN]")} – ${oBien(v.destino, "[DESTINO]")}.
Localizador ${oBien(v.localizador, "[LOCALIZADOR]")}. Referencia del expediente: ${e.id}.

${hoy()}

Quien suscribe, letrado del Ilustre Colegio de la Abogacía de ${oBien(d.colegio, "[COLEGIO]")},
número ${oBien(d.colegiado, "[Nº COLEGIADO]")}, actuando en nombre y representación de
${oBien(cliente.nombre, "[CLIENTE]")}, con ${oBien(cliente.dni, "[DNI]")}, y del resto de pasajeros
incluidos en la reserva, cuya autorización se acompaña, formula la siguiente

RECLAMACIÓN

PRIMERO. HECHOS.
Mis representados, en número de ${c.pasajeros || 1}, disponían de reserva confirmada en el vuelo
indicado. En la fecha señalada, ${relato(e)}.${bloqueVerificacion(e)}

${c.causa && c.causa !== "ninguna"
      ? "El personal de esa compañía justificó la incidencia en el siguiente motivo: " +
        M.causaPorId(c.causa).etiqueta.toLowerCase() + "."
      : "Esa compañía no ofreció explicación alguna sobre el motivo de la incidencia."}

SEGUNDO. FUNDAMENTOS.
El vuelo queda comprendido en el ámbito del artículo 3 del Reglamento (CE) 261/2004.

${c.incidencia === "retraso" || c.incidencia === "enlace"
      ? "Conforme a la doctrina fijada en la sentencia del Tribunal de Justicia de 19 de noviembre " +
        "de 2009, asuntos acumulados C-402/07 y C-432/07 (Sturgeon), reiterada en la sentencia de 23 " +
        "de octubre de 2012, asuntos C-581/10 y C-629/10 (Nelson), los pasajeros que alcanzan su " +
        "destino final con un retraso igual o superior a tres horas se hallan en situación " +
        "equiparable a la de los pasajeros de vuelos cancelados a efectos del derecho a compensación " +
        "del artículo 7."
      : c.incidencia === "cancelacion"
        ? "El artículo 5.1.c del Reglamento reconoce el derecho a compensación en los supuestos de " +
          "cancelación, sin que concurra ninguna de las excepciones de preaviso allí previstas."
        : c.incidencia === "embarque"
          ? "El artículo 4.3 del Reglamento reconoce el derecho a compensación inmediata en los " +
            "supuestos de denegación de embarque contra la voluntad del pasajero."
          : "El artículo 10.2 del Reglamento reconoce el derecho al reembolso porcentual del precio " +
            "del billete en los supuestos de acomodación en clase inferior a la contratada."}

La distancia ortodrómica entre ${oBien(v.origen, "[ORIGEN]")} y ${oBien(v.destino, "[DESTINO]")} es de
${(r.km || 0).toLocaleString("es-ES")} kilómetros, lo que sitúa el trayecto en la banda de
${oBien(r.banda, "[BANDA]")} y determina, conforme al artículo 7.1, una compensación de
${r.importeUnitario || 0} euros por pasajero.

TERCERO. INEXISTENCIA DE CAUSA EXONERATIVA.
El artículo 5.3 exige que sea el transportista quien acredite la concurrencia de circunstancias
extraordinarias que no habrían podido evitarse incluso adoptando todas las medidas razonables.
${M.causaPorId(c.causa).cita}

CUARTO. CANTIDAD RECLAMADA.
${r.importeUnitario || 0} euros por cada uno de los ${c.pasajeros || 1} pasajeros: ${eur((r.importeUnitario || 0) * (c.pasajeros || 1))}.${
    Number(c.gastos) > 0
      ? "\nGastos de manutención, alojamiento y transporte no atendidos conforme al artículo 9, debidamente acreditados: " + eur(c.gastos) + "."
      : ""
  }
TOTAL RECLAMADO: ${eur(total)}.

QUINTO. SOLICITUD.
Que se abone la cantidad indicada mediante transferencia a la cuenta ${oBien(cliente.iban, "[IBAN]")},
en el plazo de QUINCE DÍAS naturales desde la recepción del presente escrito.

Se advierte expresamente de que esta reclamación se formula también como intento de negociación
previa a efectos del requisito de procedibilidad establecido por la Ley Orgánica 1/2025, de medidas
en materia de eficiencia del Servicio Público de Justicia. La ausencia de respuesta en el plazo
indicado se hará valer como negativa a negociar, con las consecuencias que en materia de costas
prevé dicha norma.

Transcurrido el plazo sin pago íntegro se ejercitarán las acciones judiciales procedentes, con
reclamación adicional de los intereses del artículo 1108 del Código Civil desde la fecha de este
requerimiento y de las costas que se causen.

Atentamente,

${oBien(d.letrado, "[LETRADO]")}
${oBien(d.nombre, "[DESPACHO]")}`;
}

/* ------------------------------------------------------------------ */
/* 2. Escrito ante AESA                                                */
/* ------------------------------------------------------------------ */

export function escritoAesa(e) {
  const v = e.vuelo || {}, r = e.calculo || {}, cliente = e.cliente || {}, d = e.despacho || {};
  return `AGENCIA ESTATAL DE SEGURIDAD AÉREA
División de Calidad y Protección al Usuario

RECLAMACIÓN DE PASAJERO — Reglamento (CE) 261/2004
Expediente del despacho: ${e.id}

DATOS DEL PASAJERO
Nombre: ${oBien(cliente.nombre, "[CLIENTE]")}
Documento: ${oBien(cliente.dni, "[DNI]")}
Domicilio: ${oBien(cliente.direccion, "[DOMICILIO]")}
Correo: ${oBien(cliente.email, "[CORREO]")}
Representación: ${oBien(d.letrado, "[LETRADO]")}, ${oBien(d.nombre, "[DESPACHO]")}

DATOS DEL VUELO
Compañía: ${oBien(v.aerolinea, "[AEROLÍNEA]")}
Vuelo: ${oBien(v.numero, "[Nº]")}   Fecha: ${fechaLarga(v.fecha)}
Ruta: ${oBien(v.origen, "[ORIGEN]")} – ${oBien(v.destino, "[DESTINO]")}
Localizador: ${oBien(v.localizador, "[LOCALIZADOR]")}

HECHOS
En la fecha indicada, ${relato(e)}.${bloqueVerificacion(e)}

RECLAMACIÓN PREVIA A LA COMPAÑÍA
Presentada el ${fechaLarga(e.fechaReclamacion)} y ${
    e.respuestaAerolinea ? "contestada en sentido desestimatorio." : "sin respuesta hasta la fecha."
  }

PETICIÓN
Que se declare el derecho del pasajero a la compensación de ${eur(r.importeTotal || 0)} conforme al
artículo 7 del Reglamento (CE) 261/2004 y se requiera a la compañía para su abono.

Se acompaña: billete y tarjeta de embarque, reclamación previa con acuse de recibo, documento de
identidad, autorización de representación y justificantes de gastos.

NOTA INTERNA, NO INCLUIR EN EL ENVÍO
La resolución de AESA no tiene carácter vinculante ni ejecutivo, pero es un documento útil como
prueba y a menudo desbloquea el pago sin necesidad de demanda. La vía administrativa no interrumpe
por sí sola el plazo civil de prescripción: mantenga vivo el requerimiento fehaciente.`;
}

/* ------------------------------------------------------------------ */
/* 3. Hoja de encargo                                                  */
/* ------------------------------------------------------------------ */

export function hojaEncargo(e) {
  const d = e.despacho || {}, cliente = e.cliente || {}, r = e.calculo || {}, v = e.vuelo || {};
  const pct = Number(d.honorarios) || 25;
  const minuta = Math.round((r.importeTotal || 0) * (pct / 100));
  return `HOJA DE ENCARGO PROFESIONAL
Expediente ${e.id} — ${hoy()}

De una parte, ${oBien(d.nombre, "[DESPACHO]")}, con domicilio en ${oBien(d.domicilio, "[DOMICILIO]")},
representada por ${oBien(d.letrado, "[LETRADO]")}, colegiado número ${oBien(d.colegiado, "[Nº]")} del
Ilustre Colegio de la Abogacía de ${oBien(d.colegio, "[COLEGIO]")}.

De otra, ${oBien(cliente.nombre, "[CLIENTE]")}, con ${oBien(cliente.dni, "[DNI]")} y domicilio en
${oBien(cliente.direccion, "[DOMICILIO]")}, en adelante el cliente.

PRIMERA. OBJETO.
El cliente encarga la reclamación de la compensación que le corresponde por la incidencia sufrida en
el vuelo ${oBien(v.numero, "[Nº]")} de ${fechaLarga(v.fecha)}, ruta ${oBien(v.origen, "[ORIGEN]")} –
${oBien(v.destino, "[DESTINO]")}, al amparo del Reglamento (CE) 261/2004. El encargo comprende la
reclamación extrajudicial, la reclamación ante la Agencia Estatal de Seguridad Aérea si procede y,
en su caso, la vía judicial en primera instancia.

SEGUNDA. HONORARIOS.
Se pactan honorarios de resultado del ${pct} % más IVA sobre las cantidades efectivamente cobradas,
incluidos intereses. Estimación orientativa sobre la reclamación actual: ${eur(minuta)} más IVA sobre
un total reclamado de ${eur(r.importeTotal || 0)}.
Si no se obtiene cantidad alguna, el cliente no abonará honorarios.
${
  r.bajoUmbralLEC
    ? "\nADVERTENCIA EXPRESA AL CLIENTE. Al ser la cuantía inferior a 2.000 euros, la intervención de\n" +
      "abogado y procurador no es preceptiva conforme al artículo 23.2.1.º de la Ley de Enjuiciamiento\n" +
      "Civil, y los honorarios de letrado quedan excluidos de una eventual condena en costas salvo\n" +
      "apreciación de temeridad, conforme al artículo 32.5 del mismo texto. El cliente declara conocer\n" +
      "que podría reclamar por sí mismo y que, aun con condena en costas favorable, los honorarios\n" +
      "pactados se detraerán de la indemnización."
    : ""
}

TERCERA. GASTOS Y SUPLIDOS.
Los gastos de procurador, peritos y tasas, si los hubiera, correrán por cuenta del cliente, previa
información y aceptación por escrito.

CUARTA. INFORMACIÓN Y DOCUMENTACIÓN.
El cliente se obliga a facilitar la documentación del vuelo y a comunicar cualquier oferta,
abono o bono que reciba directamente de la compañía.

QUINTA. PROTECCIÓN DE DATOS.
Responsable: ${oBien(d.nombre, "[DESPACHO]")}. Finalidad: gestión del encargo profesional. Base
jurídica: ejecución del contrato y cumplimiento de obligaciones legales. Conservación: durante la
vigencia del encargo y los plazos de prescripción de responsabilidad profesional. Destinatarios: la
compañía aérea reclamada, AESA y los órganos judiciales, cuando resulte necesario para el encargo.
Derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad ante
${oBien(d.email, "[CORREO]")}, y reclamación ante la Agencia Española de Protección de Datos.

SEXTA. DESISTIMIENTO.
Tratándose de contrato celebrado a distancia con consumidor, el cliente dispone de catorce días
naturales para desistir sin penalización. Si solicita el inicio inmediato de la actuación, abonará
la parte proporcional de lo ya ejecutado.

En ${oBien(d.ciudad, "[CIUDAD]")}, a ${hoy()}.

El cliente                                   El letrado`;
}

/* ------------------------------------------------------------------ */
/* 4. Demanda de juicio verbal                                         */
/* ------------------------------------------------------------------ */

export function demandaVerbal(e) {
  const v = e.vuelo || {}, c = e.caso || {}, r = e.calculo || {}, d = e.despacho || {};
  const cliente = e.cliente || {};
  const total = r.importeTotal || 0;
  const causa = M.causaPorId(c.causa);
  const esRetraso = c.incidencia === "retraso" || c.incidencia === "enlace";

  return `AL TRIBUNAL DE INSTANCIA DE ${oBien(d.partido, "[PARTIDO JUDICIAL]").toUpperCase()}
SECCIÓN DE LO MERCANTIL QUE POR TURNO CORRESPONDA

[Verifíquese el encabezamiento conforme a la implantación de los Tribunales de Instancia en el
partido judicial y a la sección competente en materia de transporte.]

${oBien(d.letrado, "[LETRADO]")}, abogado del Ilustre Colegio de la Abogacía de ${oBien(d.colegio, "[COLEGIO]")},
colegiado número ${oBien(d.colegiado, "[Nº]")}, en nombre y representación de
${oBien(cliente.nombre, "[DEMANDANTE]")}, con ${oBien(cliente.dni, "[DNI]")} y domicilio en
${oBien(cliente.direccion, "[DOMICILIO]")}, según acredito mediante ${
    r.bajoUmbralLEC
      ? "la autorización que se acompaña como documento número uno, sin intervención de procurador por no ser preceptiva conforme al artículo 23.2.1.º de la Ley de Enjuiciamiento Civil"
      : "el poder que se acompaña como documento número uno"
  }, comparezco y como mejor proceda en Derecho DIGO:

Que mediante el presente escrito formulo DEMANDA DE JUICIO VERBAL en reclamación de cantidad contra
${oBien(v.aerolinea, "[AEROLÍNEA DEMANDADA]")}, con domicilio a efectos de emplazamiento en
[DOMICILIO SOCIAL EN ESPAÑA O SUCURSAL], en reclamación de ${eur(total)}, con base en los siguientes

HECHOS

PRIMERO. EL CONTRATO DE TRANSPORTE.
Mi representado concertó con la demandada un contrato de transporte aéreo de pasajeros para el vuelo
${oBien(v.numero, "[Nº]")}, con salida prevista de ${oBien(v.origen, "[ORIGEN]")} y llegada a
${oBien(v.destino, "[DESTINO]")} el ${fechaLarga(v.fecha)}, amparado por la reserva
${oBien(v.localizador, "[LOCALIZADOR]")}, en la que figuraban ${c.pasajeros || 1} pasajeros.
Se acompaña como documento número dos la reserva y como documento número tres la tarjeta de embarque,
que acredita tanto la existencia del contrato como la presentación en facturación.

SEGUNDO. EL INCUMPLIMIENTO.
En la fecha indicada, ${relato(e)}.${bloqueVerificacion(e)}
Se acompaña como documento número cuatro la acreditación de la hora real de llegada.

TERCERO. LA CAUSA ALEGADA POR LA DEMANDADA.
${
    c.causa === "ninguna"
      ? "La demandada no ha alegado causa alguna que justifique la incidencia, pese a haber sido requerida expresamente para ello."
      : "La demandada ha justificado la incidencia en el siguiente motivo: " + causa.etiqueta.toLowerCase() +
        ". Como se razonará, ni ese motivo constituye circunstancia extraordinaria en el sentido del artículo 5.3, ni la demandada ha acreditado haber adoptado todas las medidas razonables a su alcance."
  }

CUARTO. LA RECLAMACIÓN PREVIA Y EL INTENTO DE NEGOCIACIÓN.
Con fecha ${fechaLarga(e.fechaReclamacion)} se dirigió a la demandada reclamación extrajudicial
fehaciente, que se acompaña como documento número cinco junto con su acuse de recibo, en la que se
requería el pago de la cantidad ahora reclamada y se advertía de su valor como intento de
negociación a los efectos del requisito de procedibilidad de la Ley Orgánica 1/2025.
${
    e.respuestaAerolinea
      ? "La demandada contestó rechazando el pago, según documento número seis."
      : "La demandada no ha atendido el requerimiento ni ha dado respuesta alguna, lo que integra la negativa a negociar."
  }

QUINTO. CUANTÍA.
La cuantía de la demanda asciende a ${eur(total)}, determinada conforme a los artículos 251.1.ª y 253
de la Ley de Enjuiciamiento Civil.

A los anteriores hechos son de aplicación los siguientes

FUNDAMENTOS DE DERECHO

I. JURISDICCIÓN, COMPETENCIA Y PROCEDIMIENTO.
Corresponde la competencia objetiva a la sección de lo mercantil, por tratarse de una acción
promovida al amparo de la normativa reguladora del transporte aéreo.

En cuanto a la competencia territorial, la sentencia del Tribunal de Justicia de 9 de julio de 2009,
Rehder, C-204/08, declaró que en el transporte aéreo el lugar de cumplimiento de la obligación es,
a elección del demandante, el de salida o el de llegada del avión. En el presente caso se ejercita
la acción ante el tribunal correspondiente a ${oBien(d.partido, "[PARTIDO JUDICIAL]")}, por ser el
del ${oBien(d.fuero, "lugar de salida del vuelo")}.

El procedimiento adecuado es el juicio verbal, por razón de la cuantía, conforme al artículo 250.2
de la Ley de Enjuiciamiento Civil.

II. LEGITIMACIÓN.
La activa corresponde a mi representado como pasajero titular de reserva confirmada. La pasiva
corresponde a la demandada como transportista aéreo encargado de efectuar el vuelo, en el sentido
del artículo 2.b del Reglamento (CE) 261/2004, con independencia de con quién se contratara el
billete.

III. ÁMBITO DE APLICACIÓN DEL REGLAMENTO.
${(r.pasos || []).filter((p) => p.norma === "Art. 3").map((p) => p.detalle).join(" ") || "[Ámbito]"}

IV. LA DOCTRINA SOBRE EL GRAN RETRASO Y SU PROYECCIÓN SOBRE ESTE CASO.
${
  esRetraso
    ? `El Reglamento (CE) 261/2004 no contemplaba expresamente la compensación por retraso, sino solo
por cancelación y denegación de embarque. Esa laguna generó durante años una desigualdad difícil de
justificar: el pasajero cuyo vuelo se cancelaba cobraba, y el que llegaba doce horas tarde no cobraba
nada. La sentencia del Tribunal de Justicia de 19 de noviembre de 2009, asuntos acumulados C-402/07 y
C-432/07 (Sturgeon y otros), vino a colmar ese vacío interpretando el Reglamento a la luz del
principio de igualdad de trato.

El Tribunal declaró que los pasajeros de vuelos retrasados pueden equipararse a los pasajeros de
vuelos cancelados a efectos de la aplicación del derecho a compensación, de modo que pueden invocar
el derecho a la compensación del artículo 7 cuando soportan, en relación con el vuelo, una pérdida de
tiempo igual o superior a tres horas, es decir, cuando llegan al destino final tres horas o más
después de la hora de llegada inicialmente prevista.

La doctrina se asienta sobre tres parámetros que conviene desglosar. El primero es que el daño
indemnizado no es el retraso en sí, sino la pérdida irreversible de tiempo, que es un perjuicio
idéntico para todos los pasajeros y por eso se repara a tanto alzado. El segundo es que el momento
determinante no es la salida sino la llegada al destino final, criterio confirmado en la sentencia de
26 de febrero de 2013, Folkerts, C-11/11, para los vuelos con conexión amparados por una reserva
única. El tercero es que el umbral de tres horas opera de manera objetiva, sin que quepa exigir al
pasajero prueba adicional del perjuicio. Frente a las dudas suscitadas por la sentencia Sturgeon, el
Tribunal la confirmó íntegramente en la sentencia de 23 de octubre de 2012, asuntos C-581/10 y
C-629/10 (Nelson y otros), descartando que resultara contraria al Convenio de Montreal o al principio
de proporcionalidad.

Pues bien, proyectando esta doctrina sobre los hechos objeto del pleito, la subsunción es directa. El
vuelo ${oBien(v.numero, "[Nº]")} alcanzó ${oBien(v.destino, "[DESTINO]")}, destino final del billete
de mi representado, con un retraso de ${M.formatoMinutos(c.minutos || 0)} sobre la hora programada,
según acredita el documento número cuatro. Se supera por tanto con holgura el umbral de las tres
horas fijado en Sturgeon. ${
        c.incidencia === "enlace"
          ? "Y, tratándose de un trayecto con conexión amparado por una reserva única, el cómputo se realiza sobre la llegada al destino final y no sobre cada segmento, tal y como impone Folkerts, sin que la puntualidad del primer tramo tenga relevancia alguna."
          : "El retraso se mide, además, sobre la llegada efectiva al destino final, sin que la demandada pueda ampararse en la hora de salida ni en la duración del trayecto."
      }`
    : c.incidencia === "cancelacion"
      ? `El artículo 5.1.c del Reglamento reconoce el derecho a compensación en los supuestos de
cancelación, salvo que concurra alguna de las tres excepciones de preaviso allí tasadas. La carga de
acreditar tanto el momento de la comunicación como el contenido del transporte alternativo ofrecido
corresponde al transportista, según declaró el Tribunal de Justicia en la sentencia de 11 de mayo de
2017, Krijgsman, C-302/16, donde se precisó que el transportista encargado de efectuar el vuelo debe
abonar la compensación cuando no acredita que informó al pasajero con más de dos semanas de
antelación, sin que baste con alegar que trasladó la información a la agencia de viajes.

Trasladando estos parámetros al supuesto enjuiciado, la demandada comunicó la cancelación con
${c.avisoDias || 0} días de antelación, ${
          (c.avisoDias || 0) < 7
            ? "esto es, con menos de siete días, sin ofrecer un transporte alternativo que permitiera salir con no más de una hora de antelación y llegar con menos de dos horas de retraso"
            : "sin ofrecer un transporte alternativo dentro de los márgenes legalmente exigidos"
        }, de modo que no concurre ninguna de las excepciones del artículo 5.1.c y la compensación es
plenamente debida.`
      : `El artículo 4.3 del Reglamento reconoce el derecho a compensación inmediata cuando se deniega el
embarque contra la voluntad del pasajero. El Tribunal de Justicia, en la sentencia de 4 de octubre de
2012, Finnair, C-22/11, precisó que el concepto de denegación de embarque no se limita al exceso de
reservas, sino que comprende otros motivos, y que el transportista no puede oponer la reorganización
de vuelos derivada de circunstancias anteriores para negar la compensación.

En el caso que nos ocupa, mi representado se presentó en facturación dentro del plazo exigido, con
reserva confirmada y sin que concurriera motivo razonable de los previstos en el artículo 2.j, por lo
que la denegación genera el derecho a la compensación íntegra del artículo 7, sin umbral horario
alguno.`
}

V. CUANTIFICACIÓN CONFORME AL ARTÍCULO 7.
${(r.pasos || []).filter((p) => p.norma === "Art. 7.1" || p.norma === "Art. 7.2").map((p) => p.detalle).join(" ")}
${
  r.reducido
    ? ""
    : "La cantidad resultante se multiplica por el número de pasajeros incluidos en la reserva, al tratarse de un derecho individual de cada uno de ellos."
}
${
  Number(c.gastos) > 0
    ? "\nA lo anterior deben sumarse " + eur(c.gastos) + " en concepto de gastos de manutención, " +
      "alojamiento y transporte que mi representado hubo de adelantar ante el incumplimiento por la " +
      "demandada de las obligaciones de asistencia del artículo 9, cuyos justificantes se acompañan."
    : ""
}

VI. LA HORA DE LLEGADA COMO HECHO CONTROVERTIDO.
Anticipando la posible discusión sobre el momento exacto de llegada, procede recordar la sentencia
del Tribunal de Justicia de 4 de septiembre de 2014, Germanwings, C-452/13. La cuestión prejudicial
era en apariencia menor, casi doméstica: qué debe entenderse por hora de llegada, si el momento del
aterrizaje, el de detención del aparato o el de apertura de puertas. Su trascendencia práctica es
enorme, porque de ella depende que un retraso quede por encima o por debajo del umbral de las tres
horas.

El Tribunal declaró que el concepto de hora de llegada debe entenderse referido al momento en que se
abre al menos una de las puertas del avión, por ser ese el instante en que cesa la situación de
confinamiento del pasajero y este puede reanudar sus actividades.

La doctrina establece así un criterio único y verificable, que desplaza los registros de aterrizaje
o de calzos, sistemáticamente más favorables al transportista. Todo margen de rodaje y estacionamiento
juega, por tanto, en contra de la demandada.

Trasladando este criterio al supuesto enjuiciado, cualquier dato que aporte la demandada referido al
aterrizaje o a la llegada a plataforma resultará insuficiente por defecto, ya que la apertura de
puertas es necesariamente posterior. El retraso acreditado por esta parte constituye un mínimo, no un
máximo.

VII. LA CARGA DE LA PRUEBA DE LA CIRCUNSTANCIA EXTRAORDINARIA.
El artículo 5.3 del Reglamento exonera al transportista únicamente cuando prueba que la incidencia se
debió a circunstancias extraordinarias que no podrían haberse evitado incluso si se hubieran tomado
todas las medidas razonables. La regla se completa con el artículo 217 de la Ley de Enjuiciamiento
Civil sobre disponibilidad y facilidad probatoria: es la demandada, y no el pasajero, quien dispone
de los registros técnicos, de los partes de incidencias y de la documentación de la rotación.

La sentencia del Tribunal de Justicia de 22 de diciembre de 2008, Wallentin-Hermann, C-549/07,
constituye el leading case en la materia. Resolvía el caso de un vuelo cancelado por una avería
compleja en el motor, y su relevancia radica en que fijó, por primera vez y con vocación de
generalidad, un criterio restrictivo de interpretación de la excepción, frente a la práctica
extendida de las compañías de invocar cualquier contratiempo técnico para eludir el pago.

El Tribunal declaró que un problema técnico surgido en una aeronave que provoca la cancelación de un
vuelo no está comprendido en el concepto de circunstancias extraordinarias, salvo que se derive de
acontecimientos que, por su naturaleza o por su origen, no sean inherentes al ejercicio normal de la
actividad del transportista aéreo y escapen a su control efectivo.

Del pronunciamiento se extraen dos requisitos acumulativos: que el suceso no sea inherente al
ejercicio normal de la actividad, y que escape al control efectivo del transportista. A ello añade el
Tribunal un tercer filtro, el de las medidas razonables, que exige acreditar que se hizo todo lo
posible para evitar el retraso. Esta línea se ha mantenido después: en la sentencia de 17 de
septiembre de 2015, van der Lans, C-257/14, sobre averías inesperadas de piezas; y en la sentencia de
23 de marzo de 2021, Airhelp, C-28/20, respecto de las huelgas del propio personal, que se consideran
inherentes al ejercicio normal de la actividad por ser previsibles y gestionables por la empresa.

Pues bien, proyectando esta doctrina sobre los hechos del pleito: ${
    causa.extraordinaria
      ? "aun cuando el motivo invocado por la demandada pudiera encuadrarse en abstracto entre los sucesos ajenos a su control, no basta con su mera alegación. Corresponde a la demandada acreditar, primero, la realidad del suceso concreto y su incidencia causal directa sobre este vuelo, y, segundo, que agotó todas las medidas razonables a su alcance para reducir el retraso, incluida la reprogramación de la rotación o la contratación de un vuelo alternativo. Nada de ello consta acreditado, y esta parte impugna desde ahora cualquier documento interno unilateral que se aporte sin refrendo de tercero."
      : "el motivo invocado por la demandada es precisamente el que la jurisprudencia citada excluye del concepto de circunstancia extraordinaria. " + causa.cita + " No concurre por tanto el primero de los requisitos acumulativos, lo que hace innecesario el examen de los restantes y determina la íntegra estimación de la demanda."
  }

[Complétese, en su caso, con la jurisprudencia de la Audiencia Provincial de ${oBien(d.audiencia, "[AUDIENCIA]")}
que resulte aplicable al caso, con indicación de número, fecha y ECLI.]

VIII. INTERESES.
Procede la condena al pago de los intereses del artículo 1108 del Código Civil desde la fecha del
requerimiento extrajudicial y, en todo caso, de los del artículo 576 de la Ley de Enjuiciamiento
Civil desde la sentencia.

IX. COSTAS.
Conforme al artículo 394 de la Ley de Enjuiciamiento Civil, con expresa consideración de la conducta
procesal de la demandada, que ha desatendido un requerimiento previo fundado y ha forzado este
procedimiento.${
    r.bajoUmbralLEC
      ? " A los efectos del artículo 32.5 del mismo texto legal, se interesa expresamente la apreciación de temeridad, dada la claridad de la doctrina aplicable y la ausencia de respuesta al requerimiento previo."
      : ""
  }

Por lo expuesto,

SUPLICO AL TRIBUNAL que tenga por presentado este escrito con sus documentos y copias, se sirva
admitirlo, tenga por formulada DEMANDA DE JUICIO VERBAL en reclamación de cantidad contra
${oBien(v.aerolinea, "[AEROLÍNEA DEMANDADA]")} y, previos los trámites legales, dicte sentencia por la
que se condene a la demandada a abonar a mi representado la cantidad de ${eur(total)}, más los
intereses legales devengados desde el requerimiento extrajudicial, con expresa imposición de costas
a la demandada.

OTROSÍ DIGO PRIMERO. Que se acompañan los documentos reseñados en el cuerpo del escrito, y se
interesa que, en caso de negar la demandada la hora real de llegada, se le requiera para que aporte
los registros de a bordo y la documentación de la rotación del aparato, con los efectos del artículo
329 de la Ley de Enjuiciamiento Civil.

OTROSÍ DIGO SEGUNDO. Que se acredita el intento de negociación previa mediante el documento número
cinco, a los efectos del requisito de procedibilidad, y se solicita que su desatención se valore a
efectos de costas.

OTROSÍ DIGO TERCERO. Que esta parte ${
    r.bajoUmbralLEC ? "no considera necesaria" : "considera necesaria"
  } la celebración de vista, sin perjuicio de lo que el tribunal acuerde.

OTROSÍ DIGO CUARTO. Que se designa como dirección electrónica a efectos de notificaciones
${oBien(d.email, "[CORREO]")}, y se manifiesta la voluntad de cumplir cuantos requisitos exija la ley,
solicitando que se conceda plazo de subsanación si se apreciara algún defecto.

En ${oBien(d.ciudad, "[CIUDAD]")}, a ${hoy()}.

${oBien(d.letrado, "[LETRADO]")}
Colegiado n.º ${oBien(d.colegiado, "[Nº]")} — ICA ${oBien(d.colegio, "[COLEGIO]")}`;
}

/* ------------------------------------------------------------------ */
/* 5. Nota interna de viabilidad                                       */
/* ------------------------------------------------------------------ */

export function notaInterna(e) {
  const r = e.calculo || {}, c = e.caso || {}, v = e.vuelo || {}, d = e.despacho || {};
  const p = M.prescripcion(v.fecha);
  const pct = Number(d.honorarios) || 25;
  const w = e.verificacion;

  return `NOTA INTERNA DE VIABILIDAD — EXPEDIENTE ${e.id}
Entrada: ${fechaLarga(e.creado)}   ·   Estado: ${e.estado || "nuevo"}

VUELO
${oBien(v.numero, "—")} · ${fechaLarga(v.fecha)} · ${oBien(v.origen, "—")} – ${oBien(v.destino, "—")} · ${oBien(v.aerolinea, "—")}
Distancia: ${(r.km || 0).toLocaleString("es-ES")} km (${r.intraUE ? "intracomunitario" : "extracomunitario"})
Incidencia: ${nombreIncidencia(c.incidencia)} · ${M.formatoMinutos(c.minutos || 0)}
Causa alegada: ${M.causaPorId(c.causa).etiqueta}

VALORACIÓN
Veredicto: ${r.veredicto || "—"}
Compensación: ${r.importeUnitario || 0} € × ${c.pasajeros || 1} pasajeros${Number(c.gastos) ? " + " + eur(c.gastos) + " de gastos" : ""}
TOTAL: ${eur(r.importeTotal || 0)}
Probabilidad estimada: ${Math.round((r.probabilidad || 0) * 100)} % · Valor esperado: ${eur(r.valorEsperado || 0)}
Minuta al ${pct} %: ${eur(Math.round((r.importeTotal || 0) * (pct / 100)))} más IVA

TRAZA DE LA DECISIÓN
${(r.pasos || []).map((s, i) => (i + 1) + ". [" + s.norma + "] " + s.titulo + ": " + s.detalle).join("\n")}

COMPROBACIÓN DEL RETRASO
${
  w && w.encontrado
    ? `Fuente: ${w.fuente} · indicativo ${w.indicativo} · aeronave ${w.icao24}
Despegue real: ${oBien(w.despegueLocal, oBien(w.despegueUtc, "—"))}
Aterrizaje real: ${oBien(w.aterrizajeLocal, oBien(w.aterrizajeUtc, "—"))}
Llegada prevista: ${w.llegadaPrevistaLocal || "no indicada"}
Retraso calculado: ${w.retrasoMin != null ? M.formatoMinutos(Math.max(0, w.retrasoMin)) : "no calculable"}
${(w.avisos || []).map((a) => "· " + a).join("\n")}`
    : "Sin comprobación automática. Recábese certificado de la aerolínea o captura del panel del aeropuerto."
}

PRESCRIPCIÓN
${
  p
    ? p.vencida
      ? "ACCIÓN PRESCRITA. Límite: " + p.limite + "."
      : "Quedan " + p.dias.toLocaleString("es-ES") + " días. Límite: " + p.limite +
        " (art. 1964.2 CC). El requerimiento fehaciente interrumpe el plazo, art. 1973 CC."
    : "Falta la fecha del vuelo."
}

ESTRATEGIA PROCESAL
${
  r.bajoUmbralLEC
    ? "Cuantía igual o inferior a 2.000 €: no es preceptiva la intervención de abogado ni procurador (art. 23.2.1.º LEC) y los honorarios quedan fuera de la condena en costas salvo temeridad (art. 32.5 LEC). La minuta sale de la indemnización. Valórese acumular a los demás pasajeros de la reserva o a otros afectados del mismo vuelo para superar el umbral."
    : "Cuantía superior a 2.000 €: intervención preceptiva de abogado y procurador, con honorarios recuperables por la vía de costas."
}
Competencia territorial: a elección del demandante, lugar de salida o de llegada (STJUE Rehder, C-204/08).
Requisito de procedibilidad: acredítese el intento de negociación previa conforme a la Ley Orgánica 1/2025.

DOCUMENTACIÓN A RECABAR DEL CLIENTE
1. Tarjeta de embarque o justificante de facturación de cada pasajero.
2. Localizador y correo de confirmación de la reserva.
3. DNI o pasaporte de cada pasajero. Si hay menores, libro de familia y firma de ambos progenitores.
4. Prueba de la hora real de llegada: captura de la aplicación de la aerolínea o del panel del aeropuerto.
5. Comunicaciones recibidas de la compañía sobre la incidencia.
6. Facturas de comidas, alojamiento y transporte alternativo.
7. Hoja de encargo y autorización de representación firmadas.
8. Certificado de titularidad de la cuenta bancaria.

OBSERVACIONES DEL CLIENTE
${oBien(e.cliente && e.cliente.observaciones, "—")}

NOTAS DEL DESPACHO
${oBien(e.notas, "—")}`;
}

/* ------------------------------------------------------------------ */

export const TIPOS = {
  reclamacion: { titulo: "Reclamación extrajudicial", generar: reclamacionExtrajudicial },
  aesa: { titulo: "Reclamación ante AESA", generar: escritoAesa },
  encargo: { titulo: "Hoja de encargo", generar: hojaEncargo },
  demanda: { titulo: "Demanda de juicio verbal", generar: demandaVerbal },
  nota: { titulo: "Nota interna de viabilidad", generar: notaInterna }
};

/**
 * Reúne las líneas que en la plantilla están partidas por anchura, para que el
 * escrito salga en párrafos corridos al pegarlo en Word. Se unen dos líneas
 * solo si la primera es larga (venía cortada) y la segunda no abre un
 * encabezado, de modo que los bloques de datos y los epígrafes se respetan.
 */
function reflujo(texto) {
  const lineas = String(texto).split("\n");
  const salida = [];
  const abreEpigrafe = (l) =>
    !l.trim() ||
    /^(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|HECHOS|FUNDAMENTOS|SUPLICO|OTROSÍ|ASUNTO|RECLAMACIÓN|NOTA|DATOS|PETICIÓN|TOTAL|En |El cliente|Atentamente)/.test(l.trim()) ||
    /^[IVX]+\.\s/.test(l.trim()) ||
    /^\d+\.\s/.test(l.trim()) ||
    /^[·\[-]/.test(l.trim()) ||
    l.trim() === l.trim().toUpperCase();

  // Palabras de enlace: si una línea acaba en una de ellas es que venía
  // cortada, aunque haya quedado corta al sustituir los datos del expediente.
  const enlace = /\b(de|del|la|el|los|las|un|una|unos|unas|en|y|o|a|al|con|por|para|que|se|su|sus|como|entre|sobre|desde|hasta|no|es|ha|más|cuando|conforme|artículo|sentencia|asuntos)$/i;

  for (const linea of lineas) {
    const previa = salida[salida.length - 1];
    const venIaCortada = previa !== undefined &&
      (previa.length >= 70 || (previa.trim() && enlace.test(previa.trim())));
    if (venIaCortada && linea.trim() && !abreEpigrafe(linea)) {
      salida[salida.length - 1] = previa.replace(/\s+$/, "") + " " + linea.trim();
    } else {
      salida.push(linea);
    }
  }
  return salida.join("\n");
}

export function generarDocumento(expediente, tipo) {
  const t = TIPOS[tipo];
  if (!t) throw new Error("Tipo de documento desconocido: " + tipo);
  const bruto = t.generar(expediente);
  // La nota interna se lee en pantalla, así que conserva sus saltos.
  return { titulo: t.titulo, texto: tipo === "nota" ? bruto : reflujo(bruto) };
}
