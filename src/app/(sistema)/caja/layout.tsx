"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

const navPrincipal = [
  { label: "Croquis y cobros", href: "/caja", icon: "🪑" },
  { label: "Ventas", href: "/caja/ventas", icon: "🧾" },
  { label: "Stock rápido", href: "/caja/stock-rapido", icon: "📦" },
  { label: "Cierre de turno", href: "/caja/cierre-turno", icon: "🧾" },
];

function saludoHora(h: number) {
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

function CajaContenido({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [nombreCajero, setNombreCajero] = useState<string>("Cajero/a");
  const [rolUsuario, setRolUsuario] = useState<string | null>(null);
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [ahora, setAhora] = useState<Date | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (href === "/caja") return pathname === "/caja";
    return pathname.startsWith(href);
  };

  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let activo = true;
    async function cargarPerfilYEstadoCaja() {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const [{ data: profile }, { data: turnoAbierto }] = await Promise.all([
        supabase
          .from("profiles")
          .select("nombre, rol")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("cierres_caja")
          .select("id")
          .is("cerrado_en", null)
          .order("abierto_en", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (!activo) return;
      if (profile?.nombre) {
        setNombreCajero(profile.nombre);
      }
      setRolUsuario(profile?.rol ?? null);
      setCajaAbierta(Boolean(turnoAbierto));
    }
    void cargarPerfilYEstadoCaja();
    return () => {
      activo = false;
    };
  }, [pathname]);

  useEffect(() => {
    dockRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  const hora = ahora
    ? ahora.toLocaleTimeString("es-BO", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--:--";

  const fecha = ahora
    ? ahora
        .toLocaleDateString("es-BO", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
        .replace(/^./, (c) => c.toUpperCase())
    : "\u00A0";

  const saludoBienvenida = ahora
    ? `${saludoHora(ahora.getHours())}, ${nombreCajero}`
    : `Bienvenido, ${nombreCajero}`;

  async function handleLogout() {
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
    rolUsuario !== "admin" && cajaAbierta === false;

  return (
    <div className="flex min-h-dvh flex-col bg-stone-950 text-stone-100 md:flex-row">
      <aside className="hidden border-r border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-950 md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-xl shadow-lg shadow-orange-600/30">
              🔥
            </div>
            <div className="min-w-0 leading-none">
              <p className="truncate text-base font-black uppercase tracking-tight text-white">
                La Caprichosa
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-400">
                Grill &amp; Burger
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Caja · Turno
            </span>
            <span className="truncate text-xs font-semibold text-stone-400">
              {nombreCajero}
            </span>
          </div>
        </div>

        <nav
          aria-label="Navegación principal de caja"
          className="flex-1 space-y-1 overflow-y-auto px-3 pb-3"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Operación
          </p>
          {navPrincipal.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 font-bold text-stone-950 shadow-lg shadow-orange-600/20"
                    : "text-stone-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span
                  className={`text-lg transition ${
                    active ? "" : "group-hover:scale-110"
                  }`}
                >
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.07] p-4">
          <button
            type="button"
            onClick={handleLogout}
            disabled={saliendo}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-stone-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50"
          >
            <span>🚪</span>
            <span>{saliendo ? "Saliendo..." : "Cerrar sesión"}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/[0.07] bg-stone-950/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(50% 140% at 15% 0%, rgba(249,115,22,0.16), transparent), radial-gradient(40% 120% at 100% 0%, rgba(244,63,94,0.10), transparent)",
            }}
          />

          <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 md:px-8 md:py-4">
            <div className="flex min-w-0 items-center">
              <Link
                href="/caja"
                className="flex min-w-0 items-center gap-3 md:hidden"
              >
                <span className="relative shrink-0">
                  <span
                    aria-hidden
                    className="absolute -inset-1 rounded-[1.25rem] bg-gradient-to-br from-amber-400/40 to-rose-600/40 blur-md"
                  />
                  <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-2xl shadow-lg shadow-orange-600/30">
                    🔥
                  </span>
                </span>
                <span className="min-w-0 leading-none">
                  <span className="block truncate text-base font-black uppercase tracking-tight text-white sm:text-lg">
                    La Caprichosa
                  </span>
                  <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-400">
                    {saludoBienvenida}
                  </span>
                </span>
              </Link>

              <div className="hidden min-w-0 items-center gap-4 md:flex">
                <span className="relative shrink-0">
                  <span
                    aria-hidden
                    className="absolute -inset-1.5 rounded-3xl bg-gradient-to-br from-amber-400/40 to-rose-600/40 blur-lg"
                  />
                  <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-2xl shadow-lg shadow-orange-600/30">
                    🔥
                  </span>
                </span>

                <div className="min-w-0 leading-tight">
                  <p className="truncate bg-gradient-to-r from-white via-white to-amber-200 bg-clip-text text-xl font-extrabold tracking-tight text-transparent lg:text-2xl">
                    {saludoBienvenida}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-stone-400">
                    {fecha}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
              <div
                aria-label={`Hora actual ${hora}`}
                className="hidden items-center rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2 sm:flex"
              >
                <span className="text-lg font-extrabold tabular-nums tracking-tight text-white">
                  {hora}
                </span>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={saliendo}
                aria-label="Cerrar sesión"
                className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/5 text-lg transition hover:border-rose-500/40 hover:bg-rose-500/10 active:scale-95 disabled:opacity-50 md:hidden"
              >
                {saliendo ? "…" : "🚪"}
              </button>
            </div>
          </div>

          <div
            aria-hidden
            className="h-[2px] w-full bg-gradient-to-r from-transparent via-orange-500/70 to-transparent"
          />
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            {bloqueadoPorCajaCerrada ? (
              <div className="mx-auto max-w-lg space-y-4 rounded-3xl border border-amber-400/30 bg-stone-900/90 p-6 text-center">
                <div className="text-4xl">🔒</div>
                <h1 className="text-xl font-black text-white">
                  La caja aún no está abierta
                </h1>
                <p className="text-sm text-stone-400">
                  El administrador debe abrir la caja con su monto inicial para
                  habilitar el turno de caja.
                </p>
                <button
                  type="button"
                  onClick={handleLogout}
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
        </main>
      </div>

      <nav
        aria-label="Navegación inferior de caja"
        className="fixed inset-x-0 bottom-0 z-30 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-stone-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div
            ref={dockRef}
            className="flex snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {navPrincipal.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-1.5 transition active:scale-95 ${
                    active
                      ? "bg-gradient-to-r from-amber-400 to-orange-500 text-stone-950 shadow-lg shadow-orange-600/30"
                      : "text-stone-200 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="text-base leading-none">{item.icon}</span>
                  <span
                    className={`whitespace-nowrap text-[11px] leading-tight ${
                      active ? "font-extrabold text-stone-950" : "font-semibold"
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

export default function CajaLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-stone-950 p-6 text-stone-100">
          Cargando...
        </div>
      }
    >
      <CajaContenido>{children}</CajaContenido>
    </Suspense>
  );
}
