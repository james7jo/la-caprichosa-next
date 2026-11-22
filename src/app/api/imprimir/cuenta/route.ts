import { NextResponse } from "next/server";
import { jsPDF } from "jspdf";

type ItemCuenta = {
  nombre: string;
  cantidad: number;
  subtotal: number;
  notas?: string | null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const pedidoId = body?.pedidoId ? String(body.pedidoId) : "Sin ID";
    const mesa = String(body?.mesa || "Mesa");
    const mesero = String(body?.mesero || "Mesero");
    const metodo = String(body?.metodo || "EFECTIVO").toUpperCase();
    const subtotal = Number(body?.subtotal || 0);
    const propina = Number(body?.propina || 0);
    const total = Number(body?.total ?? subtotal + propina);
    const montoPagado =
      body?.montoPagado !== undefined && body?.montoPagado !== null
        ? Number(body.montoPagado)
        : null;
    const cambio =
      body?.cambio !== undefined && body?.cambio !== null
        ? Number(body.cambio)
        : null;
    const nota = body?.nota ? String(body.nota).trim() : null;
    const items: ItemCuenta[] = Array.isArray(body?.items) ? body.items : [];

    // Formato tipo ticket térmico angosto (80 mm de ancho)
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, 210],
    });

    const horaBO = new Intl.DateTimeFormat("es-BO", {
      timeZone: "America/La_Paz",
      dateStyle: "short",
      timeStyle: "medium",
      hour12: true,
    }).format(new Date());

    let y = 9;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("LA CAPRICHOSA", 40, y, { align: "center" });

    y += 4.5;
    doc.setFontSize(8.5);
    doc.text("GRILL & BURGER", 40, y, { align: "center" });

    y += 5;
    doc.setFontSize(10);
    doc.text("RECIBO DE CONSUMO", 40, y, { align: "center" });

    y += 3.5;
    doc.line(5, y, 75, y);

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    const lineasMesa = doc.splitTextToSize(`Cuenta: ${mesa}`, 70);
    doc.text(lineasMesa, 5, y);
    y += lineasMesa.length * 4.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`Atendido por: ${mesero}`, 5, y);

    y += 4.5;
    doc.text(`Fecha/Hora: ${horaBO}`, 5, y);

    y += 4.5;
    doc.text(`Pedido: #${pedidoId.slice(0, 8)} · Pago: ${metodo}`, 5, y);

    y += 3.5;
    doc.line(5, y, 75, y);

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("CANT / DETALLE", 5, y);
    doc.text("SUBTOTAL", 75, y, { align: "right" });

    y += 4.5;
    for (const item of items) {
      if (y > 180) {
        doc.addPage([80, 210], "portrait");
        y = 9;
      }

      const cant = Number(item.cantidad || 1);
      const subItem = Number(item.subtotal || 0);
      const lineasNombre = doc.splitTextToSize(
        `${cant}x ${item.nombre}`,
        50
      );

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(lineasNombre, 5, y);

      doc.setFont("helvetica", "bold");
      doc.text(`Bs ${subItem.toFixed(2)}`, 75, y, { align: "right" });

      y += lineasNombre.length * 4.2;

      if (item.notas) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        const lineasNota = doc.splitTextToSize(`  (${item.notas})`, 65);
        doc.text(lineasNota, 5, y);
        y += lineasNota.length * 3.8;
      }

      y += 1.5;
    }

    y += 2;
    doc.line(5, y, 75, y);

    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("Subtotal consumo:", 5, y);
    doc.text(`Bs ${subtotal.toFixed(2)}`, 75, y, { align: "right" });

    if (propina > 0) {
      y += 4.5;
      doc.text(`Propina (${mesero}):`, 5, y);
      doc.text(`Bs ${propina.toFixed(2)}`, 75, y, { align: "right" });
    }

    y += 5.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("TOTAL PAGADO:", 5, y);
    doc.text(`Bs ${total.toFixed(2)}`, 75, y, { align: "right" });

    if (metodo === "EFECTIVO" && montoPagado !== null && montoPagado > 0) {
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Entregado:", 5, y);
      doc.text(`Bs ${montoPagado.toFixed(2)}`, 75, y, { align: "right" });

      if (cambio !== null && cambio >= 0) {
        y += 4.2;
        doc.text("Cambio:", 5, y);
        doc.text(`Bs ${cambio.toFixed(2)}`, 75, y, { align: "right" });
      }
    }

    if (nota) {
      y += 5;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      const lineasNotaCaja = doc.splitTextToSize(`Nota: ${nota}`, 70);
      doc.text(lineasNotaCaja, 5, y);
      y += lineasNotaCaja.length * 4;
    }

    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text("¡Gracias por su preferencia!", 40, y, { align: "center" });

    const pdfArrayBuffer = doc.output("arraybuffer");

    return new NextResponse(pdfArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="recibo-${mesa
          .replaceAll(" ", "_")
          .replaceAll("+", "y")}.pdf"`,
      },
    });
  } catch (err) {
    console.error("Error generando PDF de recibo:", err);
    return NextResponse.json(
      { error: "No se pudo generar el PDF del recibo" },
      { status: 500 }
    );
  }
}