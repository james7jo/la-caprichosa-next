"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { obtenerInfoHoraBolivia } from "@/lib/hora-bolivia";

type PedidoRendicion = {
  id: string;
  origen: string;
  estado: string;
  mesa_id?: string | null;
  cliente_nombre?: string | null;
  total: number;
  created_at: string;
};

type CobroRendicion = {
  id: string;
  pedido_id: string;
  metodo: string;
  monto: number;
  propina: number;
  created_at: string;
};

type MesaNombre = {
  id: string;
  numero: number;
  nombre?: string | null;
};

const horaBoCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

export default function MeseroMiRendicionPage() {
  const [pedidos, setPedidos] = useState<PedidoRendicion[]>([]);
  const [cobros, setCobros] = useState<CobroRendicion[]>([]);
  const [mesasMap, setMesasMap] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);

  const cargarRendicion = useCallback(async () => {
    const supabase = createClient();
    const bo = obtenerInfoHoraBolivia();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) {
      setCargando(false);
      return;
    }

    const [{ data: pedData }, { data: cobData }, { data: mesData }] =
      await Promise.all([
        supabase
          .from("pedidos")
          .select(
            "id, origen, estado, mesa_id, cliente_nombre, total, created_at",
          )
          .eq("mesero_id", userId)
          .gte("created_at", `${bo.fechaBolivia}T00:00:00.000-04:00`)
          .order("created_at", { ascending: false }),
        supabase
          .from("cobros")
          .select("id, pedido_id, metodo, monto, propina, created_at")
          .eq("mesero_id", userId)
          .gte("created_at", `${bo.fechaBolivia}T00:00:00.000-04:00`)
          .order("created_at", { ascending: false }),
        supabase.from("mesas").select("id, numero, nombre"),
      ]);

    const mapa: Record<string, string> = {};
    ((mesData as MesaNombre[] | null) ?? []).forEach((m) => {
      mapa[m.id] = m.nombre || `Mesa ${m.numero}`;
    });

    setMesasMap(mapa);
    setPedidos(
      ((pedData as PedidoRendicion[] | null) ?? []).map((p) => ({
        ...p,
        total: Number(p.total || 0),
      })),
    );
    setCobros(
      ((cobData as CobroRendicion[] | null) ?? []).map((c) => ({
        ...c,
        monto: Number(c.monto || 0),
        propina: Number(c.propina || 0),
      })),
    );
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargarRendicion();

    const supabase = createClient();
    const canal = supabase
      .channel("mesero-mi-rendicion-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos" },
        cargarRendicion,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cobros" },
        cargarRendicion,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [cargarRendicion]);

  const totalCobrado = cobros.reduce((s, c) => s + c.monto, 0);
  const totalPropinas = cobros.reduce((s, c) => s + c.propina, 0);
  const pedidosAbiertos = pedidos.filter((p) =>
    ["abierto", "en_cocina", "por_cobrar"].includes(p.estado),
  ).length;

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-5 sm:px-6">
      <div>
        <h1 className="text-xl font-extrabold text-white sm:text-2xl">
          Mi rendición del día
        </h1>
        <p className="text-xs text-stone-400">
          Resumen de tus mesas atendidas, cobros realizados y propinas ganadas.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        <div className="rounded-3xl border border-amber-400/30 bg-stone-900/80 p-4">
          <p className="text-[11px] font-extrabold text-amber-300">
            Vendido hoy
          </p>
          <p className="mt-1 text-lg font-black tabular-nums text-white sm:text-2xl">
            Bs {totalCobrado.toFixed(2)}
          </p>
        </div>

        <div className="rounded-3xl border border-emerald-400/30 bg-stone-900/80 p-4">
          <p className="text-[11px] font-extrabold text-emerald-300">
            Mis propinas
          </p>
          <p className="mt-1 text-lg font-black tabular-nums text-emerald-300 sm:text-2xl">
            Bs {totalPropinas.toFixed(2)}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-stone-900/80 p-4">
          <p className="text-[11px] font-extrabold text-stone-300">En curso</p>
          <p className="mt-1 text-lg font-black tabular-nums text-white sm:text-2xl">
            {pedidosAbiertos}
          </p>
        </div>
      </div>

      {cargando ? (
        <div className="h-56 animate-pulse rounded-3xl bg-stone-900/70" />
      ) : (
        <section className="space-y-3 rounded-3xl border border-white/[0.07] bg-stone-900/70 p-4 sm:p-5">
          <h2 className="text-base font-extrabold text-white">
            Pedidos atendidos hoy ({pedidos.length})
          </h2>

          {pedidos.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-xs text-stone-500">
              Aún no atendiste pedidos hoy.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {pedidos.map((p) => {
                const cobro = cobros.find((c) => c.pedido_id === p.id);
                const destino = p.mesa_id
                  ? mesasMap[p.mesa_id] || "Mesa"
                  : p.cliente_nombre || "Para llevar";
                const pagado = p.estado === "pagado" || Boolean(cobro);

                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 py-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">
                        {destino}
                      </p>
                      <p className="mt-0.5 text-stone-400">
                        {horaBoCorta(p.created_at)} ·{" "}
                        {pagado ? (
                          <span className="font-bold text-emerald-300">
                            Cobrado ({(cobro?.metodo || "caja").toUpperCase()})
                          </span>
                        ) : (
                          <span className="font-bold text-amber-300">
                            En atención
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-black tabular-nums text-white">
                        Bs {p.total.toFixed(2)}
                      </p>
                      {cobro && cobro.propina > 0 && (
                        <p className="text-[11px] font-bold tabular-nums text-emerald-300">
                          +Bs {cobro.propina.toFixed(2)} propina
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
