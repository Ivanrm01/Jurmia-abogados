/**
 * Exportación de los escritos a Word (.docx) con el formato habitual de un
 * escrito judicial: A4, Times New Roman 12, interlineado 1,5, texto
 * justificado y numeración de páginas.
 *
 * Se genera en el servidor con la librería «docx», de modo que el panel no
 * tiene que cargar nada de fuera.
 */

import * as d from "docx";
import "../assets/js/lso-motor.js";
import "../assets/js/lso-escritos.js";

const { analizar, enLinea } = globalThis.EscritosLSO;

const FUENTE = "Times New Roman";
const TAM = 24; // medios puntos: 12 pt

export async function escritoAWord(titulo, contenido) {
  const mm = d.convertMillimetersToTwip;
  const runs = (trozos, extra = {}) => trozos.map((t) => new d.TextRun({
    text: t.pendiente ? `[${t.texto}]` : t.texto,
    bold: extra.bold || t.negrita,
    italics: extra.italics || t.cursiva,
    font: FUENTE,
    size: extra.size ?? TAM,
    highlight: t.pendiente ? "yellow" : undefined
  }));
  const parrafo = (texto, op = {}) => new d.Paragraph({
    alignment: op.alineacion ?? d.AlignmentType.JUSTIFIED,
    spacing: { line: 360, before: op.antes ?? 0, after: op.despues ?? 160 },
    indent: op.sangria ? { left: op.sangria, right: op.sangria } : undefined,
    children: runs(enLinea(texto), { bold: op.bold, italics: op.italics, size: op.size })
  });
  const borde = { style: d.BorderStyle.SINGLE, size: 4, color: "9AA5AE" };

  const hijos = [];
  for (const b of analizar(contenido)) {
    switch (b.t) {
      case "titulo":
        hijos.push(parrafo(b.texto, { alineacion: d.AlignmentType.CENTER, bold: true, antes: 240, despues: 240 }));
        break;
      case "apartado":
        hijos.push(parrafo(b.texto, { bold: true, antes: 200, alineacion: d.AlignmentType.LEFT }));
        break;
      case "cita":
        hijos.push(parrafo(b.texto, { sangria: mm(12) }));
        break;
      case "derecha":
        hijos.push(parrafo(b.texto, { alineacion: d.AlignmentType.RIGHT }));
        break;
      case "lista":
        for (const item of b.items) {
          hijos.push(new d.Paragraph({
            alignment: d.AlignmentType.JUSTIFIED,
            spacing: { line: 360, after: 80 },
            indent: { left: mm(10), hanging: mm(5) },
            children: [new d.TextRun({ text: "–\t", font: FUENTE, size: TAM }), ...runs(enLinea(item))]
          }));
        }
        break;
      case "tabla": {
        const columnas = Math.max(...b.filas.map((f) => f.length));
        hijos.push(new d.Table({
          width: { size: 100, type: d.WidthType.PERCENTAGE },
          borders: { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde },
          rows: b.filas.map((fila, i) => new d.TableRow({
            tableHeader: b.cabecera && i === 0,
            children: Array.from({ length: columnas }, (_, c) => new d.TableCell({
              shading: b.cabecera && i === 0 ? { type: d.ShadingType.CLEAR, color: "auto", fill: "E4EAEE" } : undefined,
              margins: { top: 60, bottom: 60, left: 90, right: 90 },
              children: [new d.Paragraph({
                spacing: { line: 260 },
                children: runs(enLinea(fila[c] ?? ""), { bold: b.cabecera && i === 0, size: 18 })
              })]
            }))
          }))
        }));
        hijos.push(new d.Paragraph({ spacing: { after: 160 }, children: [] }));
        break;
      }
      default:
        hijos.push(parrafo(b.texto));
    }
  }

  const doc = new d.Document({
    title: titulo,
    creator: "JURMIA Abogados",
    styles: { default: { document: { run: { font: FUENTE, size: TAM } } } },
    sections: [{
      properties: {
        page: {
          size: { width: mm(210), height: mm(297) },
          margin: { top: mm(25), bottom: mm(25), left: mm(30), right: mm(25) }
        }
      },
      footers: {
        default: new d.Footer({
          children: [new d.Paragraph({
            alignment: d.AlignmentType.CENTER,
            children: [new d.TextRun({ children: [d.PageNumber.CURRENT], font: FUENTE, size: 20 })]
          })]
        })
      },
      children: hijos
    }]
  });
  return d.Packer.toBuffer(doc);
}

/** Nombre de archivo sin caracteres problemáticos. */
export function nombreArchivo(...partes) {
  return partes
    .filter(Boolean)
    .join(" - ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) + ".docx";
}
