/**
 * Escritos del expediente de crédito revolving.
 *
 * Todos salen del mismo expediente, de modo que las cifras y la doctrina son
 * coherentes entre el requerimiento de documentación, la reclamación previa,
 * la demanda y el recurso.
 *
 * Son borradores de trabajo, con marcadores entre corchetes en lo que debe
 * completar o verificar el letrado. La jurisprudencia citada es la del Tribunal
 * Supremo y del Tribunal de Justicia efectivamente localizada; donde hace falta
 * doctrina de la Audiencia correspondiente se deja un marcador expreso en lugar
 * de arriesgar una cita inexacta.
 */

import "../assets/js/revolving-motor.js";

const M = globalThis.MotorRevolving;

const eur = (n) => M.euros(n);

const fechaLarga = (iso) => {
  if (!iso) return "[FECHA]";
  const d = new Date(String(iso).slice(0, 10) + "T12:00:00Z");
  if (isNaN(d.getTime())) return "[FECHA]";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });
};

const hoy = () => fechaLarga(new Date().toISOString().slice(0, 10));
const oBien = (v, alt) => (v && String(v).trim() ? String(v).trim() : alt);

const CANALES = {
  stand: "en un stand situado en la superficie comercial, en el propio punto de venta y sin posibilidad material de examinar el clausulado",
  telefono: "mediante una llamada telefónica, sin entrega previa de documentación alguna",
  oficina: "en una oficina de la entidad",
  online: "a través de un formulario en línea, mediante la mera aceptación de casillas"
};

/** Reúne las líneas partidas por anchura para que el escrito salga en párrafos. */
function reflujo(texto) {
  const lineas = String(texto).split("\n");
  const salida = [];
  const enlace = /\b(de|del|la|el|los|las|un|una|unos|unas|en|y|o|a|al|con|por|para|que|se|su|sus|como|entre|sobre|desde|hasta|no|es|ha|más|cuando|conforme|artículo|sentencia|asuntos|Pleno|TAE)$/i;
  const abre = (l) =>
    !l.trim() ||
    /^(PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO|SEXTO|SÉPTIMO|OCTAVO|NOVENO|DÉCIMO|HECHOS|FUNDAMENTOS|SUPLICO|OTROSÍ|ASUNTO|RECLAMACIÓN|NOTA|DATOS|PETICIÓN|TOTAL|SOLICITA|En |El cliente|Atentamente|Fdo)/.test(l.trim()) ||
    /^[IVX]+\.\s/.test(l.trim()) ||
    /^\d+[.)]\s/.test(l.trim()) ||
    /^[·\[-]/.test(l.trim()) ||
    l.trim() === l.trim().toUpperCase();

  for (const linea of lineas) {
    const previa = salida[salida.length - 1];
    const cortada = previa !== undefined &&
      (previa.length >= 70 || (previa.trim() && enlace.test(previa.trim())));
    if (cortada && linea.trim() && !abre(linea)) {
      salida[salida.length - 1] = previa.replace(/\s+$/, "") + " " + linea.trim();
    } else {
      salida.push(linea);
    }
  }
  return salida.join("\n");
}

/* ------------------------------------------------------------------ */
/* 1. Requerimiento de documentación a la entidad                      */
/* ------------------------------------------------------------------ */

export function requerimientoDocumental(e) {
  const c = e.cliente || {}, t = e.tarjeta || {}, d = e.despacho || {};
  return `${oBien(d.nombre, "[DESPACHO]")}
${oBien(d.domicilio, "[DOMICILIO PROFESIONAL]")}
${oBien(d.email, "[CORREO ELECTRÓNICO]")}

A ${oBien(t.entidad, "[ENTIDAD]")}
Servicio de Atención al Cliente y Delegado de Protección de Datos

ASUNTO: solicitud de documentación contractual. Titular ${oBien(c.nombre, "[CLIENTE]")}, ${oBien(c.dni, "[DNI]")}.
Contrato de tarjeta ${oBien(t.nombre, "revolving")} suscrito en ${oBien(t.anio, "[AÑO]")}. Expediente ${e.id}.

${hoy()}

Actuando en nombre del titular, cuya autorización se acompaña, y al amparo del derecho de acceso
del artículo 15 del Reglamento (UE) 2016/679, del artículo 13 de la Ley Orgánica 3/2018 y de los
deberes de información y conservación documental que imponen la Ley 16/2011, de contratos de crédito
al consumo, y la Orden EHA/2899/2011, de transparencia y protección del cliente de servicios
bancarios, SOLICITO que en el plazo de UN MES se remita copia de:

1. Contrato de tarjeta suscrito, con todas sus condiciones generales y particulares, anverso y
   reverso, y el documento donde conste la firma del titular.
2. Información precontractual entregada, en particular la Información Normalizada Europea sobre
   Crédito al Consumo del artículo 10 de la Ley 16/2011, con acreditación de la fecha de entrega.
3. Documentación acreditativa del canal y la fecha de contratación, incluida la grabación si la
   contratación fue telefónica.
4. Cuadro de amortización o ejemplo representativo facilitado al titular en el momento de contratar.
5. Extractos y liquidaciones mensuales completos desde la contratación hasta hoy, con desglose de
   capital dispuesto, intereses, comisiones, primas de seguro y cualquier otro cargo.
6. Detalle del capital total dispuesto y del total abonado por el titular a lo largo de la relación.
7. Comunicaciones de modificación del tipo de interés o de las condiciones, con acreditación de su
   recepción.
8. En su caso, contrato de seguro asociado y justificante de su contratación separada.
9. Si el crédito ha sido cedido, identificación del cesionario, fecha y título de la cesión.

Se advierte de que la falta de aportación de esta documentación se hará valer en juicio conforme a
los artículos 217.7 y 329 de la Ley de Enjuiciamiento Civil, en aplicación de los principios de
disponibilidad y facilidad probatoria, sin perjuicio de la reclamación ante la Agencia Española de
Protección de Datos y ante el Banco de España.

${oBien(d.letrado, "[LETRADO]")}
Colegiado n.º ${oBien(d.colegiado, "[Nº]")} — ICA ${oBien(d.colegio, "[COLEGIO]")}`;
}

/* ------------------------------------------------------------------ */
/* 2. Reclamación previa, con valor de intento de negociación          */
/* ------------------------------------------------------------------ */

export function reclamacionPrevia(e) {
  const c = e.cliente || {}, t = e.tarjeta || {}, r = e.calculo || {}, d = e.despacho || {};
  return `${oBien(d.nombre, "[DESPACHO]")}
${oBien(d.domicilio, "[DOMICILIO PROFESIONAL]")}

A ${oBien(t.entidad, "[ENTIDAD]")}
Servicio de Atención al Cliente

ASUNTO: reclamación previa de nulidad contractual y restitución de cantidades.
Titular ${oBien(c.nombre, "[CLIENTE]")}, ${oBien(c.dni, "[DNI]")}. Contrato de ${oBien(t.anio, "[AÑO]")}.
Expediente ${e.id}.

${hoy()}

PRIMERO. ANTECEDENTES.
Mi representado suscribió con esa entidad un contrato de tarjeta de crédito de pago aplazado
${oBien(t.nombre, "")} en ${oBien(t.anio, "[AÑO]")}, ${CANALES[t.canal] || "en las circunstancias que constan"}.
${r.tae ? "La TAE pactada ascendía al " + r.tae + " %." : "La TAE pactada no consta en la documentación en poder del titular."}
${r.capitalDispuesto ? "A lo largo de la relación dispuso de " + eur(r.capitalDispuesto) + " y ha abonado " + eur(r.totalPagado) + "." : ""}
${r.deudaPendiente ? "Pese a ello, esa entidad continúa reclamando " + eur(r.deudaPendiente) + "." : ""}

SEGUNDO. NULIDAD POR USURA.
${r.usura === true
      ? "El tipo medio publicado por el Banco de España para esta categoría de producto en el año de contratación era del " +
        r.tipoMedio + " %, de modo que el umbral se sitúa en el " + r.umbral + " %. La TAE pactada, del " + r.tae +
        " %, lo supera. Conforme a la sentencia del Pleno del Tribunal Supremo 258/2023, de 15 de febrero, una diferencia " +
        "superior a seis puntos porcentuales convierte el interés en notablemente superior al normal del dinero, con la " +
        "nulidad radical que impone el artículo 1 de la Ley de 23 de julio de 1908 y el efecto restitutorio de su artículo 3."
      : "Se reserva expresamente esta parte el examen del carácter usurario del interés una vez se aporte la documentación " +
        "contractual solicitada, sin perjuicio de lo que sigue."}

TERCERO. NULIDAD POR FALTA DE TRANSPARENCIA.
Con independencia de lo anterior, el clausulado no supera el control de transparencia. Las sentencias
del Pleno de la Sala Primera del Tribunal Supremo 154/2025 y 155/2025, ambas de 30 de enero, exigen
que el consumidor haya podido comprender la carga económica real del contrato y el funcionamiento del
sistema revolvente, en particular el efecto de recomposición del capital que permite pagar durante
años sin reducir la deuda. En el presente caso concurren las siguientes circunstancias:
${(r.indicios || []).map((i) => "· " + i.etiqueta + ".").join("\n") || "· [Detállense los indicios concurrentes]."}

CUARTO. RESTITUCIÓN.
Declarada la nulidad, mi representado solo viene obligado a devolver el capital efectivamente
dispuesto, procediendo el reintegro de cuanto haya abonado por encima${
    r.recuperable > 0 ? ", que asciende a " + eur(r.recuperable) : ""
  }, más los intereses legales desde cada pago, y la extinción de cualquier deuda pendiente por
intereses, comisiones o gastos.

QUINTO. SOLICITUD.
Que en el plazo de UN MES se declare la nulidad del contrato, se practique la liquidación en los
términos expuestos, se abone el saldo resultante en la cuenta ${oBien(c.iban, "[IBAN]")} y se
proceda, en su caso, a la baja inmediata en cualquier fichero de solvencia patrimonial.

Esta reclamación se formula también como intento de negociación previa a los efectos del requisito de
procedibilidad establecido por la Ley Orgánica 1/2025, de medidas en materia de eficiencia del
Servicio Público de Justicia. Su desatención se hará valer a efectos de costas.

${oBien(d.letrado, "[LETRADO]")}
${oBien(d.nombre, "[DESPACHO]")}`;
}

/* ------------------------------------------------------------------ */
/* 3. Hoja de encargo                                                  */
/* ------------------------------------------------------------------ */

export function hojaEncargo(e) {
  const d = e.despacho || {}, c = e.cliente || {}, r = e.calculo || {}, t = e.tarjeta || {};
  const pct = Number(d.honorarios) || 25;
  const base = Number(r.beneficioTotal) || 0;
  return `HOJA DE ENCARGO PROFESIONAL
Expediente ${e.id} — ${hoy()}

De una parte, ${oBien(d.nombre, "[DESPACHO]")}, con domicilio en ${oBien(d.domicilio, "[DOMICILIO]")},
representada por ${oBien(d.letrado, "[LETRADO]")}, colegiado número ${oBien(d.colegiado, "[Nº]")} del
Ilustre Colegio de la Abogacía de ${oBien(d.colegio, "[COLEGIO]")}.

De otra, ${oBien(c.nombre, "[CLIENTE]")}, con ${oBien(c.dni, "[DNI]")} y domicilio en
${oBien(c.direccion, "[DOMICILIO]")}, en adelante el cliente.

PRIMERA. OBJETO.
El cliente encarga el estudio y la reclamación de la nulidad del contrato de tarjeta
${oBien(t.nombre, "revolving")} suscrito con ${oBien(t.entidad, "[ENTIDAD]")} en ${oBien(t.anio, "[AÑO]")},
por usura y, subsidiariamente, por falta de transparencia de la cláusula de intereses, con la
restitución de las cantidades indebidamente abonadas. El encargo comprende el requerimiento
documental, la reclamación extrajudicial, la reclamación ante el Banco de España si procede y la
primera instancia judicial.

SEGUNDA. HONORARIOS.
Honorarios de resultado del ${pct} % más IVA sobre el beneficio económico obtenido, entendiendo por
tal la suma de las cantidades efectivamente restituidas y de la deuda que se declare inexistente.
${base > 0 ? "Estimación orientativa sobre la valoración actual, de " + eur(base) + ": " + eur(Math.round(base * pct / 100)) + " más IVA." : ""}
Si no se obtiene resultado económico alguno, el cliente no abonará honorarios.

TERCERA. COSTAS.
Las costas que se impongan a la parte contraria corresponderán al despacho hasta el límite de los
honorarios pactados, sin que ello suponga duplicidad de cobro. Si la entidad se allanare antes de
contestar, se estará a lo dispuesto en el artículo 395 de la Ley de Enjuiciamiento Civil.

CUARTA. GASTOS Y SUPLIDOS.
Los derechos de procurador, peritos y tasas, si los hubiera, correrán por cuenta del cliente, previa
información y aceptación por escrito.

QUINTA. OBLIGACIONES DEL CLIENTE.
Facilitar el contrato y los extractos de que disponga, comunicar cualquier oferta, condonación o
propuesta de refinanciación que reciba de la entidad, y no suscribir novación ni acuerdo alguno sin
consulta previa, por su posible efecto sobre la acción.

SEXTA. PROTECCIÓN DE DATOS.
Responsable: ${oBien(d.nombre, "[DESPACHO]")}. Finalidad: gestión del encargo profesional. Base
jurídica: ejecución del contrato y cumplimiento de obligaciones legales. Destinatarios: la entidad
reclamada, el Banco de España y los órganos judiciales, cuando sea necesario para el encargo.
Conservación: durante la vigencia del encargo y los plazos de prescripción de la responsabilidad
profesional. Derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad ante
${oBien(d.email, "[CORREO]")}, y reclamación ante la Agencia Española de Protección de Datos.

SÉPTIMA. DESISTIMIENTO.
Tratándose de contrato celebrado a distancia con consumidor, el cliente dispone de catorce días
naturales para desistir sin penalización.

En ${oBien(d.ciudad, "[CIUDAD]")}, a ${hoy()}.

El cliente                                   El letrado`;
}

/* ------------------------------------------------------------------ */
/* 4. Demanda de juicio ordinario                                      */
/* ------------------------------------------------------------------ */

export function demanda(e) {
  const c = e.cliente || {}, t = e.tarjeta || {}, r = e.calculo || {}, d = e.despacho || {};
  return `AL TRIBUNAL DE INSTANCIA DE ${oBien(d.partido, "[PARTIDO JUDICIAL]").toUpperCase()}
SECCIÓN CIVIL QUE POR TURNO CORRESPONDA

[Verifíquese el encabezamiento conforme a la implantación de los Tribunales de Instancia en el
partido judicial y a la sección competente.]

${oBien(d.procurador, "[PROCURADOR]")}, procurador de los tribunales, en nombre y representación de
${oBien(c.nombre, "[DEMANDANTE]")}, con ${oBien(c.dni, "[DNI]")} y domicilio en
${oBien(c.direccion, "[DOMICILIO]")}, según poder que se acompaña como documento número uno, bajo la
dirección letrada de ${oBien(d.letrado, "[LETRADO]")}, colegiado n.º ${oBien(d.colegiado, "[Nº]")} del
Ilustre Colegio de la Abogacía de ${oBien(d.colegio, "[COLEGIO]")}, comparezco y DIGO:

Que mediante el presente escrito formulo DEMANDA DE JUICIO ORDINARIO en ejercicio de acción de
nulidad contractual con reclamación de cantidad contra ${oBien(t.entidad, "[ENTIDAD DEMANDADA]")},
con domicilio a efectos de emplazamiento en [DOMICILIO SOCIAL], con base en los siguientes

HECHOS

PRIMERO. LA CONTRATACIÓN.
Mi representado, consumidor a los efectos del artículo 3 del texto refundido de la Ley General para
la Defensa de los Consumidores y Usuarios, suscribió con la demandada un contrato de tarjeta de
crédito de pago aplazado en ${oBien(t.anio, "[AÑO]")}, ${CANALES[t.canal] || "en las circunstancias que se dirán"}.
Se acompaña como documento número dos ${t.conservaContrato === "si" ? "el contrato suscrito" : "la documentación de que dispone mi representado, sin que la demandada haya atendido el requerimiento de aportar el contrato"}.

SEGUNDO. LAS CONDICIONES ECONÓMICAS.
${r.tae ? "El contrato fijaba una TAE del " + r.tae + " %." : "La demandada no ha facilitado la TAE aplicada, pese a haber sido requerida."}
${r.capitalDispuesto ? "Mi representado dispuso de un capital total de " + eur(r.capitalDispuesto) + " y ha abonado " + eur(r.totalPagado) + ", esto es, " + eur(r.exceso) + " por encima de lo efectivamente recibido." : ""}
${r.deudaPendiente ? "Pese a ello, la demandada mantiene una reclamación de " + eur(r.deudaPendiente) + "." : ""}
Se acompañan como documento número tres los extractos y liquidaciones.

TERCERO. LA INFORMACIÓN FACILITADA.
En el momento de contratar concurrieron las siguientes circunstancias, determinantes a efectos del
control de transparencia:
${(r.indicios || []).map((i, n) => (n + 1) + ") " + i.etiqueta + ".").join("\n") || "[Detállense las circunstancias de la contratación]."}

CUARTO. RECLAMACIÓN PREVIA E INTENTO DE NEGOCIACIÓN.
Con fecha ${fechaLarga(e.fechaReclamacion)} se dirigió a la demandada reclamación extrajudicial
fehaciente, que se acompaña como documento número cuatro junto con su acuse de recibo, advirtiendo de
su valor como intento de negociación a los efectos del requisito de procedibilidad de la Ley Orgánica
1/2025. ${e.respuestaEntidad ? "La demandada contestó rechazando la pretensión." : "La demandada no ha dado respuesta alguna."}

QUINTO. CUANTÍA.
La cuantía es indeterminada, al ejercitarse una acción de nulidad contractual de la que deriva la
restitución, sin perjuicio de que el importe reclamado a día de hoy asciende a
${eur(r.recuperable || 0)}, conforme a los artículos 251 y 253 de la Ley de Enjuiciamiento Civil.

FUNDAMENTOS DE DERECHO

I. JURISDICCIÓN, COMPETENCIA Y PROCEDIMIENTO.
Competencia objetiva de la sección civil. Territorialmente, tratándose de contrato celebrado con
consumidor, es competente el tribunal del domicilio del demandante conforme al artículo 52.2 y
concordantes de la Ley de Enjuiciamiento Civil, fuero irrenunciable y apreciable de oficio según
reiterada doctrina del Tribunal de Justicia sobre la Directiva 93/13/CEE. El procedimiento adecuado
es el juicio ordinario por razón de la materia y de la cuantía indeterminada.

II. LEGITIMACIÓN Y CONDICIÓN DE CONSUMIDOR.
Mi representado contrató al margen de cualquier actividad empresarial o profesional, siéndole de
aplicación el texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios, la
Ley 7/1998 sobre condiciones generales de la contratación y la Ley 16/2011 de contratos de crédito al
consumo.

III. ACCIÓN PRINCIPAL: NULIDAD POR USURA.
El artículo 1 de la Ley de 23 de julio de 1908 declara nulo el préstamo en que se estipule un interés
notablemente superior al normal del dinero y manifiestamente desproporcionado con las circunstancias
del caso. La sentencia del Tribunal Supremo 628/2015, de 25 de noviembre, recuperó esta norma para el
crédito al consumo moderno, y la sentencia 149/2020, de 4 de marzo, la aplicó específicamente al
crédito revolving, precisando que el término de comparación no es el interés legal del dinero ni el
del crédito al consumo genérico, sino el tipo medio de las operaciones de esta misma categoría.

La cuestión que quedaba abierta era cuánta diferencia sobre ese tipo medio resulta relevante, y a ella
respondió la sentencia del Pleno 258/2023, de 15 de febrero. Su importancia radica en que sustituyó un
juicio casuístico, que había producido resoluciones contradictorias entre Audiencias, por un criterio
cuantitativo verificable. El Tribunal fijó como doctrina que la diferencia debe situarse en SEIS
PUNTOS PORCENTUALES sobre el tipo medio publicado por el Banco de España para esta concreta categoría
de producto en el capítulo 19.4 de su Boletín Estadístico, referido al año de perfección del contrato;
y que, para los contratos anteriores a 2010, por no existir serie específica previa, el término de
comparación es el TEDR de 2010, situado en el 19,32 %.

De la doctrina se extraen tres reglas de aplicación. Primera, la comparación se hace con el producto
homogéneo, no con el crédito al consumo en general. Segunda, el momento relevante es el de perfección
del contrato, sin que las posteriores reducciones unilaterales del tipo sanen la nulidad originaria.
Tercera, superado el umbral, la consecuencia es la nulidad radical del contrato, no la mera moderación
del interés.

${r.usura === true
      ? "Proyectando esta doctrina sobre el caso: el tipo medio del año " + r.anio + " era del " + r.tipoMedio +
        " %, lo que sitúa el umbral en el " + r.umbral + " %. La TAE pactada, del " + r.tae +
        " %, lo supera, de modo que el interés es notablemente superior al normal del dinero. Concurre además el segundo " +
        "requisito del artículo 1, pues la desproporción resulta manifiesta a la vista de que mi representado ha abonado " +
        eur(r.totalPagado) + " por un capital dispuesto de " + eur(r.capitalDispuesto) + ", sin que la demandada haya " +
        "acreditado circunstancia excepcional alguna que justifique semejante retribución."
      : "Se aporta como documento número cinco el Boletín Estadístico del Banco de España correspondiente al año de " +
        "contratación, a efectos de la comparación que impone la doctrina expuesta. [Complétese la subsunción una vez " +
        "confirmado el tipo medio aplicable.]"}

IV. ACCIÓN SUBSIDIARIA: NULIDAD POR FALTA DE TRANSPARENCIA.
Para el caso de que no se apreciara usura, se ejercita subsidiariamente la acción de nulidad de la
cláusula de intereses remuneratorios por no superar el control de transparencia.

La cuestión estaba pendiente de doctrina unificada hasta que la resolvieron las sentencias del Pleno
de la Sala Primera 154/2025 y 155/2025, ambas de 30 de enero (Roj: STS 242/2025 y STS 241/2025). Su
relevancia es doble: por un lado, confirman que la cláusula de intereses de un crédito revolving,
aunque defina el objeto principal del contrato, queda sometida al control de transparencia del
artículo 4.2 de la Directiva 93/13/CEE; por otro, precisan qué debe haber comprendido el consumidor
para que ese control se supere.

El Tribunal declara que no basta con la claridad gramatical ni con que la TAE figure numéricamente en
el contrato. Es preciso que el consumidor haya podido conocer, antes de contratar, la carga económica
real que asume y el modo de funcionamiento del sistema revolvente: singularmente, que el capital se
recompone con cada disposición, que una cuota reducida se destina casi íntegramente al pago de
intereses y que ello puede prolongar indefinidamente la deuda.

La doctrina se articula así en un doble filtro. El primero, de incorporación y comprensibilidad
formal. El segundo, material: la información precontractual efectivamente suministrada debe permitir
representarse el sacrificio patrimonial. Y la carga de acreditar que esa información se facilitó
recae sobre el predisponente, conforme al artículo 82.2 del texto refundido de la Ley General para la
Defensa de los Consumidores y Usuarios y al artículo 3.2 de la Directiva.

Proyectando esta doctrina sobre los hechos: la contratación se produjo ${CANALES[t.canal] || "[canal]"},
${(r.indicios || []).length
      ? "y concurren las circunstancias relatadas en el hecho tercero, que impiden sostener que mi representado pudiera " +
        "comprender el funcionamiento del producto. La demandada no ha aportado la Información Normalizada Europea, ni " +
        "ejemplo representativo, ni acreditación alguna del momento y modo de entrega de la documentación precontractual."
      : "[Complétese con las circunstancias concurrentes]."}
Declarada la abusividad, la cláusula debe tenerse por no puesta sin posibilidad de integración
conforme a la sentencia del Tribunal de Justicia de 14 de junio de 2012, asunto C-618/10, Banco
Español de Crédito, de modo que el contrato subsiste como crédito gratuito y procede la devolución de
todo lo cobrado por intereses.

V. EFECTOS RESTITUTORIOS Y PRESCRIPCIÓN.
Conforme al artículo 3 de la Ley de Represión de la Usura, declarada la nulidad el prestatario solo
viene obligado a entregar la suma recibida, debiendo el prestamista devolver cuanto exceda del capital
prestado.

Sobre el alcance temporal de esa restitución se ha pronunciado la sentencia del Pleno 350/2025, de 5
de marzo (ECLI:ES:TS:2025:836), que aborda una cuestión hasta entonces resuelta de forma dispar por
las Audiencias. El Tribunal distingue dos acciones: la declarativa de nulidad, que por ser radical y
absoluta es imprescriptible; y la restitutoria, de naturaleza personal, sometida al plazo de cinco
años del artículo 1964.2 del Código Civil, sin que la redacción del artículo 3 de la Ley de Usura
excluya las reglas generales de los artículos 1930 y siguientes.

En cuanto al día inicial, la sentencia razona que en el crédito revolving cada mes se abona una cuota
comprensiva de capital, intereses y gastos, de modo que la acción para reclamar lo pagado en exceso
nace respecto de cada pago mensual. La consecuencia práctica que fija el fallo es que el acreditado
puede reclamar lo pagado en exceso sobre el capital en los cinco años anteriores a la reclamación
extrajudicial o a la demanda, plazo que en aquel supuesto se amplió en 82 días por la suspensión del
Real Decreto 463/2020.

Aplicado al caso, y habiéndose formulado reclamación extrajudicial el ${fechaLarga(e.fechaReclamacion)},
la restitución alcanza a los pagos realizados en los cinco años anteriores a esa fecha, que ascienden
a ${eur(r.recuperable || 0)}, con los intereses devengados desde cada pago.

VI. COSTAS.
Procede su imposición a la demandada conforme al artículo 394 de la Ley de Enjuiciamiento Civil, sin
que un eventual allanamiento tardío pueda eximirla, dada la reclamación previa desatendida y la
existencia de doctrina jurisprudencial consolidada, conforme al artículo 395 del mismo texto y a la
doctrina del Tribunal de Justicia sobre el efecto disuasorio de la Directiva 93/13/CEE.

Por lo expuesto,

SUPLICO AL TRIBUNAL que tenga por presentado este escrito con sus documentos y copias, admita a
trámite la demanda y, previos los trámites legales, dicte sentencia por la que:

1.º Declare la nulidad del contrato de tarjeta suscrito entre las partes por su carácter usurario, con
los efectos del artículo 3 de la Ley de 23 de julio de 1908.

2.º Subsidiariamente, declare la nulidad por abusiva de la cláusula de intereses remuneratorios y de
cuantas comisiones y gastos accesorios se anuden a ella, teniéndolas por no puestas sin integración.

3.º En cualquiera de los casos, condene a la demandada a restituir a mi representado cuanto haya
abonado por encima del capital dispuesto, ${eur(r.recuperable || 0)} a la fecha de este escrito y lo
que resulte de la liquidación en ejecución de sentencia, más los intereses legales desde cada pago.

4.º Declare la inexistencia de la deuda que la demandada reclama${r.deudaPendiente ? ", cifrada en " + eur(r.deudaPendiente) : ""},
y ordene la cancelación de cualquier inscripción en ficheros de solvencia patrimonial derivada de ella.

5.º Condene en costas a la demandada.

OTROSÍ DIGO PRIMERO. Que se interesa el requerimiento a la demandada para que aporte el contrato, la
información precontractual y la totalidad de extractos y liquidaciones, con los efectos de los
artículos 328, 329 y 217.7 de la Ley de Enjuiciamiento Civil.

OTROSÍ DIGO SEGUNDO. Que se acredita el intento de negociación previa mediante el documento número
cuatro, a los efectos del requisito de procedibilidad.

OTROSÍ DIGO TERCERO. Que esta parte manifiesta su voluntad de cumplir cuantos requisitos exija la
ley, solicitando plazo de subsanación si se apreciara algún defecto.

En ${oBien(d.ciudad, "[CIUDAD]")}, a ${hoy()}.

${oBien(d.letrado, "[LETRADO]")}                    ${oBien(d.procurador, "[PROCURADOR]")}`;
}

/* ------------------------------------------------------------------ */
/* 5. Oposición a monitorio                                            */
/* ------------------------------------------------------------------ */

export function oposicionMonitorio(e) {
  const c = e.cliente || {}, t = e.tarjeta || {}, r = e.calculo || {}, d = e.despacho || {};
  return `AL TRIBUNAL DE INSTANCIA DE ${oBien(d.partido, "[PARTIDO JUDICIAL]").toUpperCase()}
SECCIÓN CIVIL — PROCEDIMIENTO MONITORIO N.º [Nº AUTOS]

${oBien(d.letrado, "[LETRADO]")}, en nombre de ${oBien(c.nombre, "[DEUDOR]")}, con ${oBien(c.dni, "[DNI]")},
según autorización que se acompaña, comparezco y DIGO:

Que dentro del plazo conferido formulo ESCRITO DE OPOSICIÓN a la petición inicial de procedimiento
monitorio promovida por ${oBien(t.entidad, "[ENTIDAD]")}, con base en los siguientes

HECHOS

PRIMERO. La cantidad reclamada trae causa de un contrato de tarjeta de crédito de pago aplazado
suscrito en ${oBien(t.anio, "[AÑO]")}, cuyo clausulado es nulo por las razones que se exponen.

SEGUNDO. La deuda reclamada no es cierta, líquida ni exigible, en cuanto se integra en su mayor parte
por intereses, comisiones y gastos derivados de cláusulas nulas. ${r.capitalDispuesto ? "Mi representado dispuso de " + eur(r.capitalDispuesto) + " y ha abonado ya " + eur(r.totalPagado) + "." : ""}

FUNDAMENTOS DE DERECHO

I. CONTROL DE OFICIO DE LAS CLÁUSULAS ABUSIVAS.
El artículo 815.4 de la Ley de Enjuiciamiento Civil impone al tribunal, cuando la reclamación se funde
en un contrato con consumidor, examinar de oficio el carácter abusivo de las cláusulas que
constituyan el fundamento de la petición o que determinen la cantidad exigible, antes incluso de
requerir de pago. Este control es imperativo conforme a la doctrina del Tribunal de Justicia sobre la
Directiva 93/13/CEE, entre otras la sentencia de 14 de junio de 2012, asunto C-618/10, Banco Español
de Crédito, y la de 18 de febrero de 2016, asunto C-49/14, Finanmadrid.

II. NULIDAD POR USURA.
${r.usura === true
      ? "La TAE pactada, del " + r.tae + " %, supera en más de seis puntos porcentuales el tipo medio del " +
        r.tipoMedio + " % publicado por el Banco de España para el año de contratación, umbral fijado por la sentencia " +
        "del Pleno del Tribunal Supremo 258/2023, de 15 de febrero, de modo que el contrato es radicalmente nulo conforme " +
        "al artículo 1 de la Ley de 23 de julio de 1908."
      : "[Complétese conforme al tipo medio aplicable al año de contratación, según la doctrina de la STS 258/2023.]"}

III. FALTA DE TRANSPARENCIA.
Subsidiariamente, la cláusula de intereses no supera el control de transparencia en los términos de
las sentencias del Pleno 154/2025 y 155/2025, de 30 de enero, al no constar que se facilitara
información precontractual que permitiera comprender el efecto de recomposición del capital.

IV. CONSECUENCIA.
Declarada la nulidad, mi representado solo vendría obligado a devolver el capital dispuesto, que ya ha
sido superado por lo abonado, de modo que ninguna cantidad resulta debida y procede el archivo con
imposición de costas a la instante.

SUPLICO AL TRIBUNAL que tenga por formulada OPOSICIÓN, acuerde el sobreseimiento del monitorio y, para
el caso de que la instante formule demanda, tenga por anunciadas las excepciones expuestas y la
reconvención por nulidad y restitución que en su momento se formalizará.

En ${oBien(d.ciudad, "[CIUDAD]")}, a ${hoy()}.

${oBien(d.letrado, "[LETRADO]")}`;
}

/* ------------------------------------------------------------------ */
/* 6. Recurso de apelación                                             */
/* ------------------------------------------------------------------ */

export function recursoApelacion(e) {
  const c = e.cliente || {}, t = e.tarjeta || {}, r = e.calculo || {}, d = e.despacho || {};
  return `A LA SECCIÓN CIVIL DEL TRIBUNAL DE INSTANCIA DE ${oBien(d.partido, "[PARTIDO]").toUpperCase()}
PARA ANTE LA ILMA. AUDIENCIA PROVINCIAL DE ${oBien(d.audiencia, "[AUDIENCIA]").toUpperCase()}

Autos de juicio ordinario n.º [Nº AUTOS]

${oBien(d.procurador, "[PROCURADOR]")}, en la representación acreditada de ${oBien(c.nombre, "[APELANTE]")},
comparezco y DIGO:

Que se me ha notificado la sentencia de fecha [FECHA], desestimatoria de la demanda, contra la que
interpongo RECURSO DE APELACIÓN al amparo de los artículos 455 y siguientes de la Ley de
Enjuiciamiento Civil, con base en los siguientes

ALEGACIONES

PRIMERA. INFRACCIÓN DE LA DOCTRINA SOBRE EL TÉRMINO DE COMPARACIÓN EN MATERIA DE USURA.
La resolución recurrida ${oBien(e.motivoApelacion, "[resúmase el razonamiento combatido]")}. Al hacerlo
se aparta de la doctrina fijada por la sentencia del Pleno del Tribunal Supremo 258/2023, de 15 de
febrero, que impone comparar la TAE pactada con el tipo medio de la categoría específica publicado por
el Banco de España en el capítulo 19.4 de su Boletín Estadístico y referido al año de perfección del
contrato, situando el umbral en seis puntos porcentuales.
${r.usura === true
      ? "Aplicado al caso, el tipo medio era del " + r.tipoMedio + " % y la TAE pactada del " + r.tae +
        " %, con una diferencia de " + (r.tae - r.tipoMedio).toFixed(2) + " puntos, superior al umbral. La conclusión de instancia es, por tanto, insostenible."
      : "[Complétese la subsunción numérica.]"}

SEGUNDA. INFRACCIÓN DEL CONTROL DE TRANSPARENCIA.
La sentencia omite el examen de la pretensión subsidiaria o lo resuelve con la sola mención de que la
TAE figuraba en el contrato. Ello contraviene la doctrina de las sentencias del Pleno 154/2025 y
155/2025, de 30 de enero, conforme a las cuales la claridad gramatical no agota el control de
transparencia: es preciso que el consumidor haya podido comprender la carga económica y el
funcionamiento del sistema revolvente, y la carga de acreditar la información precontractual recae en
el predisponente.

TERCERA. ERROR EN LA VALORACIÓN DE LA PRUEBA Y CARGA PROBATORIA.
La demandada no aportó la información precontractual ni acreditó su entrega, pese al requerimiento
practicado. La sentencia invierte indebidamente la carga de la prueba, con infracción del artículo
217, apartados 3 y 7, de la Ley de Enjuiciamiento Civil.

CUARTA. EFECTOS RESTITUTORIOS Y PRESCRIPCIÓN.
${e.prescripcionControvertida
      ? "La resolución aplica la prescripción tomando como día inicial la fecha del contrato, criterio expresamente rechazado por la sentencia del Pleno 350/2025, de 5 de marzo (ECLI:ES:TS:2025:836), que fija el dies a quo en cada pago mensual y reconoce la restitución de lo abonado en los cinco años anteriores a la reclamación extrajudicial."
      : "Para el caso de que se estime la nulidad, procede la restitución conforme al artículo 3 de la Ley de Represión de la Usura, con el alcance temporal fijado por la sentencia del Pleno 350/2025, de 5 de marzo."}

QUINTA. COSTAS.
Procede la imposición de las costas de la primera instancia a la demandada y, estimado el recurso, la
no imposición de las de esta alzada conforme al artículo 398.2 de la Ley de Enjuiciamiento Civil.

SUPLICO A LA SALA que, previos los trámites legales, dicte sentencia por la que, estimando el recurso,
revoque la resolución recurrida y dicte otra que estime íntegramente la demanda en los términos de su
suplico, con expresa imposición de costas de la primera instancia a la demandada.

En ${oBien(d.ciudad, "[CIUDAD]")}, a ${hoy()}.

${oBien(d.letrado, "[LETRADO]")}                    ${oBien(d.procurador, "[PROCURADOR]")}`;
}

/* ------------------------------------------------------------------ */
/* 7. Nota interna                                                     */
/* ------------------------------------------------------------------ */

export function notaInterna(e) {
  const r = e.calculo || {}, t = e.tarjeta || {}, d = e.despacho || {}, c = e.cliente || {};
  const pct = Number(d.honorarios) || 25;
  return `NOTA INTERNA DE VIABILIDAD — EXPEDIENTE ${e.id}
Entrada: ${fechaLarga(e.creado)}   ·   Estado: ${e.estado || "nuevo"}

CONTRATO
Entidad: ${oBien(t.entidad, "—")} · Tarjeta: ${oBien(t.nombre, "—")} · Año: ${oBien(t.anio, "—")}
Canal: ${CANALES[t.canal] ? t.canal : "no consta"} · Conserva contrato: ${t.conservaContrato || "no consta"}

ANÁLISIS
Vía principal: ${r.veredicto || "—"}
Usura: ${r.usura === true ? "SÍ — TAE " + r.tae + " % frente a umbral " + r.umbral + " %"
      : r.usura === false ? "no alcanza el umbral (" + r.tae + " % frente a " + r.umbral + " %)"
      : "no evaluable, falta TAE o tipo medio del año"}
Transparencia: ${r.puntosTransparencia || 0} de ${r.maximoTransparencia || 0} puntos${r.transparencia ? " — vía sólida" : " — insuficiente por ahora"}
Indicios marcados:
${(r.indicios || []).map((i) => "· " + i.etiqueta + " [" + i.cita + "]").join("\n") || "· ninguno"}

ECONOMÍA
Capital dispuesto: ${eur(r.capitalDispuesto || 0)}
Total pagado: ${eur(r.totalPagado || 0)}
Exceso sobre capital: ${eur(r.exceso || 0)}
Recuperable estimado: ${eur(r.recuperable || 0)}${r.limitadoPorPrescripcion ? " (ajustado por el límite de cinco años)" : ""}
Deuda que se extinguiría: ${eur(r.deudaPendiente || 0)}
BENEFICIO TOTAL ESTIMADO: ${eur(r.beneficioTotal || 0)}
Minuta al ${pct} %: ${eur(Math.round((r.beneficioTotal || 0) * pct / 100))} más IVA

TRAZA
${(r.pasos || []).map((s, i) => (i + 1) + ". [" + s.norma + "] " + s.titulo + ": " + s.detalle).join("\n")}

PENDIENTE DE VERIFICAR
· Tipo medio del Banco de España para ${oBien(t.anio, "[AÑO]")}: Boletín Estadístico, capítulo 19.4.
  Es documento de prueba imprescindible; no puede darse por bueno un dato aproximado.
· TAE real según contrato, que puede diferir de la recordada por el cliente.
· Existencia de cesión del crédito a un fondo, que obliga a demandar también al cesionario.
· Seguro de protección de pagos asociado, con su propia acción de nulidad.

DOCUMENTACIÓN A RECABAR DEL CLIENTE
1. DNI y contrato, si lo conserva.
2. Extractos y liquidaciones de toda la relación.
3. Justificantes de pago o certificado bancario de los cargos.
4. Comunicaciones recibidas de la entidad o de agencias de cobro.
5. Notificación de inclusión en fichero de morosos, si la hay.
6. Hoja de encargo y poder firmados.

OBSERVACIONES DEL CLIENTE
${oBien(c.observaciones, "—")}

NOTAS DEL DESPACHO
${oBien(e.notas, "—")}`;
}

/* ------------------------------------------------------------------ */

export const TIPOS = {
  requerimiento: { titulo: "Requerimiento de documentación", generar: requerimientoDocumental },
  reclamacion: { titulo: "Reclamación previa a la entidad", generar: reclamacionPrevia },
  encargo: { titulo: "Hoja de encargo", generar: hojaEncargo },
  demanda: { titulo: "Demanda de juicio ordinario", generar: demanda },
  monitorio: { titulo: "Oposición a monitorio", generar: oposicionMonitorio },
  apelacion: { titulo: "Recurso de apelación", generar: recursoApelacion },
  nota: { titulo: "Nota interna de viabilidad", generar: notaInterna }
};

export function generarDocumento(expediente, tipo) {
  const t = TIPOS[tipo];
  if (!t) throw new Error("Tipo de documento desconocido: " + tipo);
  const bruto = t.generar(expediente);
  return { titulo: t.titulo, texto: tipo === "nota" ? bruto : reflujo(bruto) };
}
