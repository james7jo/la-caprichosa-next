"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const navPrincipal = [
  { label: "Inicio", href: "/admin", icon: "🏠" },
  { label: "Mesas", href: "/admin/mesas", icon: "🪑" },
  { label: "Menú", href: "/admin/menu", icon: "🍔" },
  { label: "Ventas", href: "/admin/ventas", icon: "🧾" },
  { label: "Cajas", href: "/admin/caja", icon: "🏦" },
  { label: "Ganancias", href: "/admin/reportes", icon: "📈" },
  { label: "Gastos", href: "/admin/inventario-compras", icon: "📦" },
  { label: "Equipo", href: "/admin/usuarios", icon: "👥" },
];

const navDock = navPrincipal;

function saludo(h: number) {
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);
  const [ahora, setAhora] = useState<Date | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  useEffect(() => {
    setAhora(new Date());
    const id = setInterval(() => setAhora(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    dockRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  const hora = ahora
    ? ahora.toLocaleTimeString("es-BO", {
        timeZone: "America/La_Paz",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--:--";

  const fecha = ahora
    ? ahora
        .toLocaleDateString("es-BO", {
          timeZone: "America/La_Paz",
          weekday: "long",
          day: "numeric",
          month: "long",
        })
        .replace(/^./, (c) => c.toUpperCase())
    : "\u00A0";

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

  return (
    <div className="flex min-h-dvh flex-col bg-stone-950 text-stone-100 md:flex-row">
      {/* Sidebar para PC y tablet */}
      <aside className="hidden border-r border-white/[0.07] bg-gradient-to-b from-stone-900 to-stone-950 md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 text-xl shadow-lg shadow-orange-600/30">
              🔥
            </div>
            <div className="leading-none">
              <p className="text-base font-black uppercase tracking-tight text-white">
                La Caprichosa
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-400">
                Grill &amp; Burger
              </p>
            </div>
          </div>
          <div className="mt-4">
            <span className="inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Admin · Jefe
            </span>
          </div>
        </div>

        <nav
          aria-label="Navegación principal"
          className="flex-1 space-y-1 overflow-y-auto px-3 pb-3"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            Administración
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

        <div className="space-y-2.5 border-t border-white/[0.07] p-4">
          <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-stone-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Panel de administración activo
          </div>

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

      {/* Contenedor derecho */}
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
                href="/admin"
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
                  <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-400">
                    Grill &amp; Burger
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
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-stone-950 bg-emerald-400" />
                  </span>
                </span>

                <div className="min-w-0 leading-tight">
                  <p className="truncate bg-gradient-to-r from-white via-white to-amber-200 bg-clip-text text-xl font-extrabold tracking-tight text-transparent lg:text-2xl">
                    {ahora ? saludo(ahora.getHours()) : "Bienvenido"}
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

              <Link
                href="/admin/caja"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-400/35 bg-amber-500/15 px-3 py-2 text-xs font-extrabold text-amber-200 transition hover:bg-amber-500/25 sm:px-3.5"
              >
                <span>🏦</span>
                <span>Cajas</span>
              </Link>

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

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Dock inferior (solo celular) */}
      <nav
        aria-label="Navegación inferior"
        className="fixed inset-x-0 bottom-0 z-30 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-stone-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <div
            ref={dockRef}
            className="flex snap-x snap-proximity items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, #000 12px, #000 calc(100% - 12px), transparent)",
            }}
          >
            {navDock.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex shrink-0 snap-center flex-col items-center justify-center gap-0.5 rounded-2xl px-3 py-1.5 transition active:scale-95 ${
                    active
                      ? "bg-gradient-to-r from-amber-400 to-orange-500 text-stone-950 shadow-lg shadow-orange-600/30"
                      : "text-stone-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
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
