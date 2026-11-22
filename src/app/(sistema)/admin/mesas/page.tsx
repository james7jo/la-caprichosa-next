"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { obtenerDatosMesasAdmin } from "./consultas";
import {
  CroquisSalon,
  type MesaCroquis,
} from "@/components/mesas/croquis-salon";

export default function AdminMesasPage() {
  const [userId, setUserId] = useState("");
  const [mesas, setMesas] = useState<MesaCroquis[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const datos = await obtenerDatosMesasAdmin();
    setUserId(datos.userId);
    setErrorCarga(datos.error);
    if (!datos.error) setMesas(datos.mesas);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
    const supabase = createClient();
    const canal = supabase
      .channel("admin-mesas-croquis-rt")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "mesas" },
        (p) => {
          // Se actualiza solo la mesa que cambió, sin descargar todo otra vez
          if (p.eventType === "DELETE") {
            const id = (p.old as { id?: string }).id;
            if (id) setMesas((prev) => prev.filter((m) => m.id !== id));
            else cargar();
            return;
          }
          const n = p.new as MesaCroquis;
          setMesas((prev) =>
            prev.some((m) => m.id === n.id)
              ? prev.map((m) => (m.id === n.id ? { ...m, ...n } : m))
              : [...prev, n].sort((a, b) => a.numero - b.numero),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [cargar]);

  const habilitadas = mesas.filter((m) => m.habilitada).length;

  return (
    <main className="min-h-full bg-stone-950 p-4 text-stone-100 sm:p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              Croquis y mesas del local
            </h1>
            <p className="mt-1 text-xs text-stone-400 sm:text-sm">
              Diseña, ubica, habilita o elimina mesas por sector. Los meseros
              verán este mismo plano.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="rounded-xl border border-white/10 bg-stone-900 px-3 py-2 text-stone-300">
              Total: <strong className="text-white">{mesas.length}</strong>
            </span>
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-300">
              Habilitadas: <strong>{habilitadas}</strong>
            </span>
          </div>
        </div>

        {errorCarga && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">
            Error cargando mesas: {errorCarga}
          </div>
        )}

        {cargando ? (
          <div className="h-[420px] animate-pulse rounded-3xl border border-white/10 bg-stone-900/60" />
        ) : (
          <CroquisSalon
            mesas={mesas}
            userId={userId}
            esAdmin={true}
            onActualizado={cargar}
          />
        )}
      </div>
    </main>
  );
}
