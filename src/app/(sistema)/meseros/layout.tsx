"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

const navMesero = [
  { label: "Inicio", href: "/meseros", icon: "📊" },
  { label: "Mesas", href: "/meseros/mesas", icon: "🪑" },
  { label: "Llevar", href: "/meseros/mesas?tipo=llevar", icon: "🛍️" },
  { label: "Rendición", href: "/meseros/mi-rendicion", icon: "💵" },
];

function MeserosContenido({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [esAdmin, setEsAdmin] = useState(false);
  const [rolUsuario, setRolUsuario] = useState<string | null>(null);
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    let activo = true;
    async function verificarRolYEstadoCaja() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const [{ data: profile }, { data: turnoAbierto }] = await Promise.all([
        supabase.from("profiles").select("rol").eq("id", userId).maybeSingle(),
        supabase
          .from("cierres_caja")
          .select("id")
          .is("cerrado_en", null)
          .order("abierto_en", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!activo) return;
      const rol = profile?.rol ?? null;
      setRolUsuario(rol);
      setEsAdmin(rol === "admin");
      setCajaAbierta(Boolean(turnoAbierto));
    }

    void verificarRolYEstadoCaja();
    return () => {
      activo = false;
    };
  }, []);

  const isActive = (href: string) => {
    if (!pathname) return false;
    const base = href.split("?")[0];
    if (base === "/meseros") return pathname === "/meseros";
    return pathname.startsWith(base);
  };

  async function handleCerrarSesion() {
    if (saliendo) return;
    setSaliendo(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" }).catch(() => null);
      router.push("/login");
      router.refresh();
    } finally {
      setSaliendo(false);
    }
  }

  const bloqueadoPorCajaCerrada =
    rolUsuario !== null && rolUsuario !== "admin" && cajaAbierta === false;

  return (
    <div className="flex min-h-dvh flex-col bg-stone-950 text-stone-100 lg:flex-row">
      <aside className="hidden border-r border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-950 lg:fixed lg:inset-y-0 lg:flex lg:w-60 lg:flex-col">
        <div className="border-b border-white/[0.07] p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-black text-stone-950">
              🍽️
            </div>
            <div className="min-w-0 leading-none">
              <p className="truncate text-sm font-black uppercase tracking-tight text-white">
                La Caprichosa
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400">
                Piso · Meseros
              </p>
            </div>
          </div>
        </div>

        <nav
          aria-label="Navegación lateral del mesero"
          className="flex-1 space-y-1.5 px-3 py-4"
        >
          {navMesero.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition ${
                  active
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 font-extrabold text-stone-950 shadow-md shadow-orange-600/20"
                    : "font-semibold text-stone-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {esAdmin && (
          <div className="border-t border-white/[0.07] p-3">
            <Link
              href="/admin"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/10 px-3 py-2.5 text-xs font-extrabold text-amber-200 transition hover:bg-amber-400/20"
            >
              <span>👑</span>
              <span>Volver a Panel Admin</span>
            </Link>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0 lg:pl-60">
        {esAdmin && (
          <div className="flex items-center justify-between border-b border-amber-400/25 bg-amber-500/10 px-4 py-2 text-xs lg:hidden">
            <span className="font-bold text-amber-200">
              Vista previa como Mesero
            </span>
            <Link
              href="/admin"
              className="rounded-lg bg-amber-400 px-2.5 py-1 font-black text-stone-950"
            >
              👑 Volver a Panel Admin
            </Link>
          </div>
        )}

        <div className="flex-1 p-4 sm:p-6">
          {bloqueadoPorCajaCerrada ? (
            <div className="mx-auto mt-8 max-w-md space-y-4 rounded-3xl border border-amber-400/30 bg-stone-900/90 p-6 text-center">
              <div className="text-4xl">🔒</div>
              <h1 className="text-xl font-black text-white">
                La caja aún no está abierta
              </h1>
              <p className="text-sm text-stone-400">
                El administrador debe abrir la caja con su monto inicial antes
                de que los meseros puedan tomar pedidos o trabajar en piso.
              </p>
              <button
                type="button"
                onClick={handleCerrarSesion}
                disabled={saliendo}
                className="rounded-xl bg-amber-400 px-5 py-2.5 text-xs font-black text-stone-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saliendo ? "Saliendo..." : "Cerrar sesión"}
              </button>
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      <nav
        aria-label="Navegación del mesero"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-stone-950/95 px-2 pt-1.5 pb-[max(0.65rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto grid max-w-xl grid-cols-4 gap-1.5">
          {navMesero.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-center transition active:scale-95 ${
                  active
                    ? "bg-gradient-to-br from-amber-400 to-orange-500 font-extrabold text-stone-950 shadow-md shadow-orange-600/30"
                    : "bg-white/[0.03] font-semibold text-stone-300 hover:bg-white/[0.07]"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[11px] leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function MeserosLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-stone-950 text-stone-100 p-6">
          Cargando panel de meseros
        </div>
      }
    >
      <MeserosContenido>{children}</MeserosContenido>
    </Suspense>
  );
}
