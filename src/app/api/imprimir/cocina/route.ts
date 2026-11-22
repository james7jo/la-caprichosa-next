import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";

type ItemCocina = {
  id?: string;
  nombre: string;
  cantidad: number;
  notas?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const destino = String(body?.destino || "Mesa / Llevar");
    const mesero = String(body?.mesero || "Mesero");
    const pedidoId = body?.pedidoId ? String(body.pedidoId) : "Sin ID";
    const mesasUnidas = Boolean(body?.mesasUnidas);
    const mesasGrupo: string[] = Array.isArray(body?.mesasGrupo)
      ? body.mesasGrupo.map((m: unknown) => String(m))
      : [];
    const items: ItemCocina[] = Array.isArray(body?.items) ? body.items : [];

    // Formato tipo ticket angosto (80 mm de ancho)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, 180],
    });

    const horaBO = new Intl.DateTimeFormat("es-BO", {
      timeZone: "America/La_Paz",
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true,
    }).format(new Date());

    let y = 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("COMANDA DE COCINA", 40, y, { align: "center" });

    if (mesasUnidas) {
      y += 5.5;
      doc.setFontSize(9.5);
      doc.text("*** MESAS UNIDAS ***", 40, y, { align: "center" });
    }

    y += 6;
    doc.setFontSize(10);
    const lineasDestino = doc.splitTextToSize(`Destino: ${destino}`, 70);
    doc.text(lineasDestino, 5, y);
    y += lineasDestino.length * 4.5;

    if (mesasUnidas && mesasGrupo.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      const lineasGrupo = doc.splitTextToSize(
        `Grupo: ${mesasGrupo.join(" + ")}`,
        70
      );
      doc.text(lineasGrupo, 5, y);
      y += lineasGrupo.length * 4.2;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Mesero: ${mesero}`, 5, y);

    y += 4.5;
    doc.text(`Hora: ${horaBO}`, 5, y);

    y += 4.5;
    doc.text(`Pedido: ${pedidoId.slice(0, 8)}`, 5, y);

    y += 3;
    doc.line(5, y, 75, y);

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);

    for (const item of items) {
      if (y > 165) {
        doc.addPage([80, 180], "portrait");
        y = 8;
      }

      const cant = Number(item.cantidad || 1);
      const lineasNombre = doc.splitTextToSize(
        `${cant}x  ${item.nombre}`,
        70
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(lineasNombre, 5, y);
      y += lineasNombre.length * 4.5;

      if (item.notas) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        const lineasNota = doc.splitTextToSize(`   Nota: ${item.notas}`, 68);
        doc.text(lineasNota, 5, y);
        y += lineasNota.length * 4;
      }

      y += 2;
    }

    const pdfArrayBuffer = doc.output("arraybuffer");

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="comanda-${destino
          .replaceAll(" ", "_")
          .replaceAll("+", "y")}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Error generando PDF de comanda:", err);
    return NextResponse.json(
      { error: "No se pudo generar el PDF de cocina" },
      { status: 500 }
    );
  }
}