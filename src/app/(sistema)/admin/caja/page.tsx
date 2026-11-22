"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  cobrarCuentaEnCaja,
  registrarEgresoCaja,
  validarCobroEnCaja,
} from "@/actions/caja.actions";

type MesaCaja = {
  id: string;
  numero: number;
  nombre?: string | null;
  zona: string;
  estado: string;
  habilitada: boolean;
  mesero_actual_id?: string | null;
  unida_con_id?: string | null;
};

type ItemPedidoCaja = {
  id: string;
  pedido_id: string;
  nombre_item: string;
  cantidad: number;
  subtotal: number;
  notas_item?: string | null;
};

type PedidoCaja = {
  id: string;
  origen: string;
  estado: string;
  mesa_id?: string | null;
  mesero_id?: string | null;
  cliente_nombre?: string | null;
  total: number;
  items: ItemPedidoCaja[];
};

type CobroHoyItem = {
  id: string;
  pedido_id: string | null;
  mesero_id: string | null;
  metodo: string;
  monto: number;
  propina: number;
  validado_en_caja: boolean;
  created_at: string;
};

type PerfilMesero = {
  id: string;
  nombre: string;
};

type MetodoCobroCaja = "efectivo" | "qr" | "mixto";

const tarjetaClase =
  "rounded-3xl border border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-900/60 p-5 sm:p-6 shadow-lg shadow-black/20";

export default function AdminCajaPage() {
  const router = useRouter();
  const [seccionAdmin, setSeccionAdmin] = useState<"croquis" | "rendiciones">(
    "croquis",
  );
  const [mesas, setMesas] = useState<MesaCaja[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCaja[]>([]);
  const [cobrosHoy, setCobrosHoy] = useState<CobroHoyItem[]>([]);
  const [meseros, setMeseros] = useState<PerfilMesero[]>([]);
  const [cargando, setCargando] = useState(true);

  const [zonaActiva, setZonaActiva] = useState<string>("Todas");
  const [mesaModalId, setMesaModalId] = useState<string | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoCobroCaja>("efectivo");
  const [propinaInput, setPropinaInput] = useState("");
  const [montoPagadoInput, setMontoPagadoInput] = useState("");
  const [mixtoEfectivoInput, setMixtoEfectivoInput] = useState("");
  const [mixtoQrInput, setMixtoQrInput] = useState("");
  const [notaCobroInput, setNotaCobroInput] = useState("");

  const [motivoEgreso, setMotivoEgreso] = useState("");
  const [montoEgreso, setMontoEgreso] = useState("");

  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "error" | "alerta";
    texto: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!mensaje) return;
    const timer = setTimeout(() => {
      setMensaje(null);
    }, 2500);
    return () => clearTimeout(timer);
  }, [mensaje]);

  const cargarDatosCaja = useCallback(async () => {
    const supabase = createClient();
    const hoyBo = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/La_Paz",
    }).format(new Date());

    const [
      { data: mesasData },
      { data: pedidosData },
      { data: detallesData },
      { data: cobrosData },
      { data: perfilesData },
    ] = await Promise.all([
      supabase
        .from("mesas")
        .select(
          "id, numero, nombre, zona, estado, habilitada, mesero_actual_id, unida_con_id",
        )
        .order("numero", { ascending: true }),
      supabase
        .from("pedidos")
        .select("id, origen, estado, mesa_id, mesero_id, cliente_nombre, total")
        .in("estado", ["abierto", "en_cocina", "por_cobrar"])
        .order("created_at", { ascending: true }),
      supabase
        .from("detalle_pedidos")
        .select("id, pedido_id, nombre_item, cantidad, subtotal, notas_item"),
      supabase
        .from("cobros")
        .select(
          "id, pedido_id, mesero_id, metodo, monto, propina, validado_en_caja, created_at",
        )
        .gte("created_at", `${hoyBo}T00:00:00.000-04:00`)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, nombre"),
    ]);

    const itemsPorPedido = new Map<string, ItemPedidoCaja[]>();
    (detallesData ?? []).forEach((d) => {
      const lista = itemsPorPedido.get(d.pedido_id) ?? [];
      lista.push({
        id: d.id,
        pedido_id: d.pedido_id,
        nombre_item: d.nombre_item || "Ítem",
        cantidad: Number(d.cantidad || 1),
        subtotal: Number(d.subtotal || 0),
        notas_item: d.notas_item,
      });
      itemsPorPedido.set(d.pedido_id, lista);
    });

    const pedidosFormateados: PedidoCaja[] = (pedidosData ?? []).map((p) => ({
      id: p.id,
      origen: p.origen,
      estado: p.estado,
      mesa_id: p.mesa_id,
      mesero_id: p.mesero_id,
      cliente_nombre: p.cliente_nombre,
      total: Number(p.total || 0),
      items: itemsPorPedido.get(p.id) ?? [],
    }));

    setMesas((mesasData ?? []) as MesaCaja[]);
    setPedidos(pedidosFormateados);
    setCobrosHoy(
      (cobrosData ?? []).map((c) => ({
        ...c,
        monto: Number(c.monto || 0),
        propina: Number(c.propina || 0),
        validado_en_caja: Boolean(c.validado_en_caja),
      })),
    );
    setMeseros((perfilesData ?? []) as PerfilMesero[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargarDatosCaja();

    const supabase = createClient();
    const canal = supabase
      .channel("admin-caja-croquis-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        () => {
          void cargarDatosCaja();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        () => {
          void cargarDatosCaja();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "detalle_pedidos" },
        () => {
          void cargarDatosCaja();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cobros" },
        () => {
          void cargarDatosCaja();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargarDatosCaja]);

  const mesasHabilitadas = mesas.filter((m) => m.habilitada);
  const zonasDisponibles = [
    "Todas",
    ...Array.from(new Set(mesasHabilitadas.map((m) => m.zona || "Salón"))),
  ];

  const mesasCroquis =
    zonaActiva === "Todas"
      ? mesasHabilitadas
      : mesasHabilitadas.filter((m) => m.zona === zonaActiva);

  const ocupadasCount = mesasHabilitadas.filter(
    (m) => m.estado === "ocupada",
  ).length;
  const suciasCount = mesasHabilitadas.filter(
    (m) => m.estado === "sucia",
  ).length;
  const disponiblesCount = mesasHabilitadas.filter(
    (m) => m.estado === "disponible",
  ).length;

  const mesaSeleccionada = mesas.find((m) => m.id === mesaModalId) ?? null;

  const mesaCabezaModal = mesaSeleccionada?.unida_con_id
    ? (mesas.find((m) => m.id === mesaSeleccionada.unida_con_id) ??
      mesaSeleccionada)
    : mesaSeleccionada;

  const mesasUnidasModal = mesaCabezaModal
    ? mesas.filter((m) => m.unida_con_id === mesaCabezaModal.id)
    : [];

  const etiquetaMesaModal = mesaCabezaModal
    ? [mesaCabezaModal, ...mesasUnidasModal]
        .map((m) => m.nombre || `Mesa ${m.numero}`)
        .join(" + ")
    : "";

  const pedidoModal: PedidoCaja | null = mesaCabezaModal
    ? (pedidos.find((p) => p.mesa_id === mesaCabezaModal.id) ?? null)
    : null;

  const subtotalCuentaModal = Number(pedidoModal?.total || 0);
  const propinaModalNum = Math.max(0, Number(propinaInput) || 0);
  const totalConPropinaModal = subtotalCuentaModal + propinaModalNum;
  const montoPagadoNum = Math.max(0, Number(montoPagadoInput) || 0);
  const diferenciaCambioModal =
    metodoPago === "efectivo" && montoPagadoInput.trim() !== ""
      ? montoPagadoNum - totalConPropinaModal
      : 0;

  const mixtoEfectivoNum = Math.max(0, Number(mixtoEfectivoInput) || 0);
  const mixtoQrNum = Math.max(0, Number(mixtoQrInput) || 0);
  const sumaMixtaNum = Number((mixtoEfectivoNum + mixtoQrNum).toFixed(2));
  const diferenciaMixtoModal = Number(
    (totalConPropinaModal - sumaMixtaNum).toFixed(2),
  );

  function obtenerNombreMesero(meseroId?: string | null) {
    if (!meseroId) return "Sin asignar";
    return meseros.find((m) => m.id === meseroId)?.nombre || "Mesero";
  }

  function abrirModalMesa(mesa: MesaCaja) {
    const cabezaId = mesa.unida_con_id || mesa.id;
    const ped = pedidos.find((p) => p.mesa_id === cabezaId);
    const totalBase = Number(ped?.total || 0);
    setMetodoPago("efectivo");
    setPropinaInput("");
    setMontoPagadoInput(totalBase > 0 ? totalBase.toFixed(2) : "");
    setMixtoEfectivoInput("");
    setMixtoQrInput("");
    setNotaCobroInput("");
    setMesaModalId(mesa.id);
  }

  function autocompletarQrMixto() {
    const restante = Math.max(
      0,
      Number((totalConPropinaModal - mixtoEfectivoNum).toFixed(2)),
    );
    setMixtoQrInput(restante > 0 ? restante.toFixed(2) : "");
  }

  function dispararReciboPdfEnSegundoPlano(datosRecibo: {
    pedidoId: string;
    mesa: string;
    mesero: string;
    metodo: MetodoCobroCaja;
    subtotal: number;
    propina: number;
    total: number;
    montoPagado: number | null;
    cambio: number | null;
    nota: string | null;
    items: {
      nombre: string;
      cantidad: number;
      subtotal: number;
      notas?: string | null;
    }[];
  }) {
    void fetch("/api/imprimir/cuenta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datosRecibo),
    })
      .then(async (resp) => {
        if (!resp.ok) return;
        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("application/pdf")) {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          window.open(url, "_blank", "noopener,noreferrer");
        }
      })
      .catch(() => null);
  }

  function handleConfirmarPago(e: React.FormEvent) {
    e.preventDefault();
    if (!pedidoModal || !mesaCabezaModal) return;
    setMensaje(null);

    if (
      metodoPago === "efectivo" &&
      montoPagadoInput.trim() !== "" &&
      montoPagadoNum < totalConPropinaModal
    ) {
      setMensaje({
        tipo: "error",
        texto: `El monto entregado (Bs ${montoPagadoNum.toFixed(2)}) es menor al total con propina (Bs ${totalConPropinaModal.toFixed(2)}).`,
      });
      return;
    }

    if (metodoPago === "mixto") {
      if (sumaMixtaNum <= 0 || Math.abs(diferenciaMixtoModal) > 0.009) {
        setMensaje({
          tipo: "error",
          texto: `El pago mixto (Efectivo + QR) debe sumar Bs ${totalConPropinaModal.toFixed(2)}. Llevas Bs ${sumaMixtaNum.toFixed(2)}.`,
        });
        return;
      }
    }

    const pedidoIdActual = pedidoModal.id;
    const cabezaIdActual = mesaCabezaModal.id;
    const meseroIdActual =
      pedidoModal.mesero_id || mesaCabezaModal.mesero_actual_id || null;
    const nombreCobrado = etiquetaMesaModal;
    const metodoActual = metodoPago;
    const propinaActual = propinaModalNum;
    const efActual = mixtoEfectivoNum;
    const qrActual = mixtoQrNum;
    const idsMesasAfectadas = [
      cabezaIdActual,
      ...mesas
        .filter((m) => m.unida_con_id === cabezaIdActual)
        .map((m) => m.id),
    ];

    const notaFinal =
      metodoActual === "mixto"
        ? [
            `Mixto: Efectivo Bs ${efActual.toFixed(2)} + QR Bs ${qrActual.toFixed(2)}`,
            notaCobroInput.trim(),
          ]
            .filter(Boolean)
            .join(" · ")
        : notaCobroInput.trim() || null;

    dispararReciboPdfEnSegundoPlano({
      pedidoId: pedidoIdActual,
      mesa: nombreCobrado,
      mesero: obtenerNombreMesero(meseroIdActual),
      metodo: metodoActual,
      subtotal: subtotalCuentaModal,
      propina: propinaActual,
      total: totalConPropinaModal,
      montoPagado:
        metodoActual === "efectivo" && montoPagadoInput.trim() !== ""
          ? montoPagadoNum
          : metodoActual === "mixto"
            ? sumaMixtaNum
            : null,
      cambio:
        metodoActual === "efectivo" &&
        montoPagadoInput.trim() !== "" &&
        diferenciaCambioModal >= 0
          ? diferenciaCambioModal
          : null,
      nota: notaFinal,
      items: pedidoModal.items.map((it) => ({
        nombre: it.nombre_item,
        cantidad: it.cantidad,
        subtotal: Number(it.subtotal || 0),
        notas: it.notas_item,
      })),
    });

    setMesas((prev) =>
      prev.map((m) =>
        m.id === cabezaIdActual || m.unida_con_id === cabezaIdActual
          ? { ...m, estado: "sucia", unida_con_id: null }
          : m,
      ),
    );
    setPedidos((prev) => prev.filter((p) => p.id !== pedidoIdActual));
    setMesaModalId(null);
    setPropinaInput("");
    setMontoPagadoInput("");
    setMixtoEfectivoInput("");
    setMixtoQrInput("");
    setNotaCobroInput("");
    setMensaje({
      tipo: "ok",
      texto:
        metodoActual === "mixto"
          ? `Pago mixto confirmado (Ef. Bs ${efActual.toFixed(2)} + QR Bs ${qrActual.toFixed(2)}) en ${nombreCobrado}.`
          : `Pago confirmado (${metodoActual.toUpperCase()}) en ${nombreCobrado}.`,
    });

    startTransition(async () => {
      if (metodoActual === "mixto") {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const filasCobro: {
          pedido_id: string;
          mesero_id: string | null;
          registrado_por: string | null;
          metodo: "efectivo" | "qr";
          monto: number;
          propina: number;
          validado_en_caja: boolean;
        }[] = [];

        if (efActual > 0) {
          filasCobro.push({
            pedido_id: pedidoIdActual,
            mesero_id: meseroIdActual,
            registrado_por: user?.id ?? null,
            metodo: "efectivo",
            monto: efActual,
            propina: propinaActual,
            validado_en_caja: true,
          });
        }

        if (qrActual > 0) {
          filasCobro.push({
            pedido_id: pedidoIdActual,
            mesero_id: meseroIdActual,
            registrado_por: user?.id ?? null,
            metodo: "qr",
            monto: qrActual,
            propina: efActual > 0 ? 0 : propinaActual,
            validado_en_caja: true,
          });
        }

        const { error: cobError } = await supabase
          .from("cobros")
          .insert(filasCobro);

        if (cobError) {
          setMensaje({ tipo: "error", texto: cobError.message });
          await cargarDatosCaja();
          return;
        }

        const { error: pedError } = await supabase
          .from("pedidos")
          .update({ estado: "pagado" })
          .eq("id", pedidoIdActual);

        if (pedError) {
          setMensaje({ tipo: "error", texto: pedError.message });
          await cargarDatosCaja();
          return;
        }

        if (idsMesasAfectadas.length > 0) {
          await supabase
            .from("mesas")
            .update({
              estado: "sucia",
              unida_con_id: null,
              mesero_actual_id: null,
            })
            .in("id", idsMesasAfectadas);
        }

        await cargarDatosCaja();
        router.refresh();
        return;
      }

      const res = await cobrarCuentaEnCaja({
        pedidoId: pedidoIdActual,
        metodo: metodoActual,
        propina: propinaActual,
      });

      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        await cargarDatosCaja();
        return;
      }

      await cargarDatosCaja();
      router.refresh();
    });
  }

  function handleRegistrarEgreso(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);

    startTransition(async () => {
      const res = await registrarEgresoCaja({
        motivo: motivoEgreso,
        monto: Number(montoEgreso),
      });

      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }

      setMotivoEgreso("");
      setMontoEgreso("");
      setMensaje({
        tipo: "ok",
        texto: "Egreso registrado.",
      });
      router.refresh();
    });
  }

  function handleValidarCobro(cobroId: string) {
    startTransition(async () => {
      const res = await validarCobroEnCaja(cobroId);
      if (res?.error) {
        setMensaje({ tipo: "error", texto: res.error });
        return;
      }
      setMensaje({ tipo: "ok", texto: "Rendición validada en caja." });
      await cargarDatosCaja();
    });
  }

  const pendientesValidar = cobrosHoy.filter((c) => !c.validado_en_caja);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Caja · Administrador
          </span>
          <h1 className="text-xl font-black text-white sm:text-2xl">
            Croquis y Cobros de Caja
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSeccionAdmin("croquis")}
            className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              seccionAdmin === "croquis"
                ? "bg-amber-400 text-stone-950"
                : "border border-white/10 bg-stone-900 text-stone-300 hover:bg-white/5"
            }`}
          >
            Croquis de mesas
          </button>
          <button
            type="button"
            onClick={() => setSeccionAdmin("rendiciones")}
            className={`rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              seccionAdmin === "rendiciones"
                ? "bg-amber-400 text-stone-950"
                : "border border-white/10 bg-stone-900 text-stone-300 hover:bg-white/5"
            }`}
          >
            Rendiciones ({pendientesValidar.length})
          </button>
          <Link
            href="/admin/reportes"
            className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-3.5 py-2 text-xs font-extrabold text-stone-950 transition hover:brightness-110"
          >
            Ver Ganancias →
          </Link>
        </div>
      </header>

      {/* Resumen rápido de estados */}
      <div className="grid grid-cols-3 gap-3">
        <div className={`${tarjetaClase} border-amber-400/30`}>
          <p className="text-xs font-extrabold text-amber-300">Ocupadas</p>
          <p className="mt-1 text-2xl font-black text-white">{ocupadasCount}</p>
        </div>
        <div className={`${tarjetaClase} border-rose-400/30`}>
          <p className="text-xs font-extrabold text-rose-300">
            Sucias (por limpiar)
          </p>
          <p className="mt-1 text-2xl font-black text-white">{suciasCount}</p>
        </div>
        <div className={`${tarjetaClase} border-emerald-400/30`}>
          <p className="text-xs font-extrabold text-emerald-300">Disponibles</p>
          <p className="mt-1 text-2xl font-black text-white">
            {disponiblesCount}
          </p>
        </div>
      </div>

      {mensaje && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            mensaje.tipo === "error"
              ? "border-rose-400/35 bg-rose-500/15 text-rose-200"
              : mensaje.tipo === "alerta"
                ? "border-amber-400/35 bg-amber-400/15 text-amber-200"
                : "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {cargando ? (
        <div className="h-72 animate-pulse rounded-3xl bg-stone-900/70" />
      ) : seccionAdmin === "rendiciones" ? (
        <section className={`${tarjetaClase} space-y-3`}>
          <h2 className="text-lg font-extrabold text-white">
            Cobros y rendiciones de hoy
          </h2>
          {cobrosHoy.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-stone-400">
              Aún no hay cobros registrados hoy.
            </p>
          ) : (
            <div className="space-y-2.5">
              {cobrosHoy.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-stone-950 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-bold text-white">
                      {obtenerNombreMesero(c.mesero_id)} ·{" "}
                      <span className="uppercase text-amber-300">
                        {c.metodo}
                      </span>
                    </p>
                    <p className="text-xs text-stone-400">
                      Monto: Bs {c.monto.toFixed(2)} · Propina: Bs{" "}
                      {c.propina.toFixed(2)}
                    </p>
                  </div>

                  {c.validado_en_caja ? (
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">
                      ✓ Validado
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleValidarCobro(c.id)}
                      className="rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-extrabold text-stone-950 hover:bg-amber-300 disabled:opacity-50"
                    >
                      Validar en caja
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-12">
          {/* Croquis por sección */}
          <section className={`${tarjetaClase} space-y-4 xl:col-span-8`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-white">
                  Croquis por sección
                </h2>
                <p className="text-xs text-stone-400">
                  Toca una mesa para ver el detalle de consumo, recibo y cobro.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {zonasDisponibles.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZonaActiva(z)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                      zonaActiva === z
                        ? "bg-gradient-to-r from-amber-400 to-orange-500 text-stone-950"
                        : "border border-white/10 bg-stone-950 text-stone-300 hover:border-white/25"
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {mesasCroquis.map((mesa) => {
                const tieneUnidas = mesas.some(
                  (m) =>
                    m.unida_con_id === mesa.id || mesa.unida_con_id === m.id,
                );
                const cabezaId = mesa.unida_con_id || mesa.id;
                const pedidoMesa = pedidos.find((p) => p.mesa_id === cabezaId);
                const meseroNombre = obtenerNombreMesero(
                  pedidoMesa?.mesero_id || mesa.mesero_actual_id,
                );

                const estiloEstado =
                  mesa.estado === "ocupada"
                    ? "border-amber-400/50 bg-amber-400/10 hover:border-amber-300"
                    : mesa.estado === "sucia"
                      ? "border-rose-400/45 bg-rose-500/10 hover:border-rose-300"
                      : "border-emerald-400/35 bg-stone-950 hover:border-emerald-400";

                return (
                  <button
                    key={mesa.id}
                    type="button"
                    onClick={() => abrirModalMesa(mesa)}
                    className={`flex flex-col justify-between rounded-2xl border p-3.5 text-left transition ${estiloEstado}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-black text-white">
                          {mesa.nombre || `Mesa ${mesa.numero}`}
                        </p>
                        <p className="text-[11px] text-stone-400">
                          {mesa.zona}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          mesa.estado === "ocupada"
                            ? "bg-amber-400/20 text-amber-300"
                            : mesa.estado === "sucia"
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {mesa.estado}
                      </span>
                    </div>

                    <div className="mt-3 space-y-1 text-[11px]">
                      {tieneUnidas && (
                        <p className="font-extrabold text-purple-300">
                          🟣 Mesa unida
                        </p>
                      )}
                      {mesa.estado === "ocupada" && (
                        <>
                          <p className="truncate text-stone-300">
                            Mesero:{" "}
                            <span className="font-bold">{meseroNombre}</span>
                          </p>
                          {pedidoMesa && (
                            <p className="font-black tabular-nums text-emerald-300">
                              Bs {Number(pedidoMesa.total || 0).toFixed(2)}
                            </p>
                          )}
                        </>
                      )}
                      {mesa.estado === "sucia" && (
                        <p className="font-semibold text-rose-200/90">
                          Por limpiar
                        </p>
                      )}
                      {mesa.estado === "disponible" && (
                        <p className="text-stone-400">Disponible</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Registro de egresos */}
          <section className="space-y-4 xl:col-span-4">
            <form
              onSubmit={handleRegistrarEgreso}
              className={`${tarjetaClase} space-y-3`}
            >
              <h2 className="text-lg font-extrabold text-white">
                Registrar egreso
              </h2>
              <p className="text-xs text-stone-400">
                Registra salidas de dinero del turno.
              </p>

              <input
                type="text"
                value={motivoEgreso}
                onChange={(e) => setMotivoEgreso(e.target.value)}
                placeholder="Motivo (ej. hielo, carbón, bolsas)"
                className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
              />
              <input
                type="number"
                min="0.1"
                step="0.5"
                value={montoEgreso}
                onChange={(e) => setMontoEgreso(e.target.value)}
                placeholder="Monto en Bs"
                className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
              />
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-2xl border border-amber-400/40 bg-amber-400/15 py-2.5 text-sm font-extrabold text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-50"
              >
                {isPending ? "Guardando..." : "Guardar egreso"}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Modal de detalle, recibo y cobro */}
      {mesaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-stone-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-black text-white">
                    {etiquetaMesaModal}
                  </h3>
                  {mesasUnidasModal.length > 0 && (
                    <span className="rounded-full border border-purple-400/40 bg-purple-500/15 px-2.5 py-0.5 text-[11px] font-extrabold text-purple-200">
                      Mesas unidas
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-stone-400">
                  Estado:{" "}
                  <span className="font-bold uppercase text-stone-200">
                    {mesaSeleccionada.estado}
                  </span>{" "}
                  · Mesero:{" "}
                  <span className="font-bold text-amber-300">
                    {obtenerNombreMesero(
                      pedidoModal?.mesero_id ||
                        mesaSeleccionada.mesero_actual_id,
                    )}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMesaModalId(null)}
                className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white hover:bg-white/15"
              >
                ✕
              </button>
            </div>

            {!pedidoModal || pedidoModal.items.length === 0 ? (
              <div className="space-y-4 py-6 text-center">
                <p className="text-sm text-stone-300">
                  Esta mesa no tiene consumos abiertos por cobrar.
                </p>
                <button
                  type="button"
                  onClick={() => setMesaModalId(null)}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-extrabold text-white"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleConfirmarPago} className="mt-4 space-y-4">
                <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-stone-950 p-4">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-stone-400">
                    Detalle de consumo
                  </p>
                  <ul className="divide-y divide-white/[0.06] text-sm">
                    {pedidoModal.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex items-start justify-between gap-2 py-2"
                      >
                        <div>
                          <p className="font-bold text-white">
                            {it.cantidad}× {it.nombre_item}
                          </p>
                          {it.notas_item && (
                            <p className="text-xs text-amber-300/85">
                              {it.notas_item}
                            </p>
                          )}
                        </div>
                        <span className="font-bold tabular-nums text-stone-200">
                          Bs {Number(it.subtotal).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-1 border-t border-white/[0.07] pt-3 text-xs">
                    <div className="flex items-center justify-between text-stone-400">
                      <span>Consumo</span>
                      <span className="font-bold tabular-nums text-stone-200">
                        Bs {subtotalCuentaModal.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-stone-400">
                      <span>Propina</span>
                      <span className="font-bold tabular-nums text-amber-300">
                        Bs {propinaModalNum.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-sm font-extrabold text-white">
                        Total a pagar
                      </span>
                      <span className="text-xl font-black tabular-nums text-emerald-300">
                        Bs {totalConPropinaModal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Método de pago: Efectivo, QR o Mixto */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-300">
                    Método de pago
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["efectivo", "qr", "mixto"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMetodoPago(m)}
                        className={`rounded-2xl border py-3 text-xs font-black uppercase transition ${
                          metodoPago === m
                            ? "border-amber-400 bg-gradient-to-r from-amber-400 to-orange-500 text-stone-950"
                            : "border-white/10 bg-stone-950 text-stone-300 hover:border-white/25"
                        }`}
                      >
                        {m === "efectivo"
                          ? "💵 Efectivo"
                          : m === "qr"
                            ? "📱 QR"
                            : "🔀 Mixto"}
                      </button>
                    ))}
                  </div>
                </div>

                {metodoPago === "mixto" ? (
                  <div className="space-y-2.5 rounded-2xl border border-amber-400/25 bg-stone-950 p-3.5">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-stone-300">
                          Efectivo (Bs)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={mixtoEfectivoInput}
                          onChange={(e) =>
                            setMixtoEfectivoInput(e.target.value)
                          }
                          placeholder="0.00"
                          className="w-full rounded-xl border border-white/10 bg-stone-900 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-stone-300">
                            QR (Bs)
                          </label>
                          <button
                            type="button"
                            onClick={autocompletarQrMixto}
                            className="text-[11px] font-extrabold text-amber-300 hover:underline"
                          >
                            Completar resto
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={mixtoQrInput}
                          onChange={(e) => setMixtoQrInput(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-white/10 bg-stone-900 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-stone-300">
                        Propina para{" "}
                        {obtenerNombreMesero(
                          pedidoModal.mesero_id ||
                            mesaSeleccionada.mesero_actual_id,
                        )}{" "}
                        (Bs)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={propinaInput}
                        onChange={(e) => setPropinaInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-white/10 bg-stone-900 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-white/[0.07] pt-2 text-xs">
                      <span className="text-stone-400">
                        Suma mixta: Bs {sumaMixtaNum.toFixed(2)}
                      </span>
                      <span
                        className={`font-extrabold ${
                          Math.abs(diferenciaMixtoModal) < 0.009 &&
                          sumaMixtaNum > 0
                            ? "text-emerald-300"
                            : "text-amber-300"
                        }`}
                      >
                        {Math.abs(diferenciaMixtoModal) < 0.009 &&
                        sumaMixtaNum > 0
                          ? "Cuadrado ✅"
                          : diferenciaMixtoModal > 0
                            ? `Falta Bs ${diferenciaMixtoModal.toFixed(2)}`
                            : `Excede Bs ${Math.abs(diferenciaMixtoModal).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-stone-300">
                        Propina para{" "}
                        {obtenerNombreMesero(
                          pedidoModal.mesero_id ||
                            mesaSeleccionada.mesero_actual_id,
                        )}{" "}
                        (Bs)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={propinaInput}
                        onChange={(e) => setPropinaInput(e.target.value)}
                        placeholder="0.00"
                        className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>

                    {metodoPago === "efectivo" && (
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-stone-300">
                          Cliente paga con (Bs)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={montoPagadoInput}
                          onChange={(e) => setMontoPagadoInput(e.target.value)}
                          placeholder={totalConPropinaModal.toFixed(2)}
                          className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                    )}
                  </div>
                )}

                {metodoPago === "efectivo" &&
                  montoPagadoInput.trim() !== "" && (
                    <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-stone-950 px-4 py-2.5 text-xs">
                      <span className="font-bold text-stone-300">
                        Cambio a devolver
                      </span>
                      <span
                        className={`text-base font-black tabular-nums ${
                          diferenciaCambioModal < 0
                            ? "text-rose-400"
                            : "text-emerald-300"
                        }`}
                      >
                        {diferenciaCambioModal < 0
                          ? `Falta Bs ${Math.abs(diferenciaCambioModal).toFixed(2)}`
                          : `Bs ${diferenciaCambioModal.toFixed(2)}`}
                      </span>
                    </div>
                  )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-300">
                    Nota de caja (opcional)
                  </label>
                  <input
                    type="text"
                    value={notaCobroInput}
                    onChange={(e) => setNotaCobroInput(e.target.value)}
                    placeholder="Ej. cliente frecuente, vuelve luego"
                    className="w-full rounded-xl border border-white/10 bg-stone-950 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-black text-stone-950 shadow-lg shadow-orange-600/25 transition hover:brightness-110 disabled:opacity-50"
                  >
                    {isPending
                      ? "Confirmando..."
                      : "🧾 Confirmar pago e imprimir recibo"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
