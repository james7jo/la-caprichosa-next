"use client";

import { useMemo } from "react";
import {
  bs,
  formatFechaHora,
  formatHora,
  horasTxt,
  mismoDia,
} from "@/lib/reportes/utilidades";
import type { DatosReporte } from "@/lib/reportes/consultas";

type StatMesero = {
  id: string;
  nombre: string;
  enTurno: boolean;
  entrada: string | null;
  salida: string | null;
  horas: number;
  turnos: DatosReporte["turnos"];
  mesas: Set<string>;
  ventas: number;
  platos: number;
  cobrado: number;
};

function Dato({
  etiqueta,
  valor,
  clase = "text-white",
}: {
  etiqueta: string;
  valor: string;
  clase?: string;
}) {
  return (
    <div className="rounded-xl bg-stone-900 p-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wide text-stone-400">
        {etiqueta}
      </span>
      <p className={`mt-0.5 text-sm font-black tabular-nums ${clase}`}>
        {valor}
      </p>
    </div>
  );
}

export function ReportePersonal({ datos }: { datos: DatosReporte }) {
  const multiDia = !mismoDia(datos.rango.desde, datos.rango.hasta);
  const fh = (iso: string | null) =>
    multiDia ? formatFechaHora(iso) : formatHora(iso);

  const meseros = useMemo(() => {
    const mapa = new Map<string, StatMesero>();
    const get = (id: string, nombre: string) => {
      let s = mapa.get(id);
      if (!s) {
        s = {
          id,
          nombre,
          enTurno: false,
          entrada: null,
          salida: null,
          horas: 0,
          turnos: [],
          mesas: new Set(),
          ventas: 0,
          platos: 0,
          cobrado: 0,
        };
        mapa.set(id, s);
      }
      return s;
    };

    datos.turnos.forEach((t) => {
      const s = get(t.meseroId, t.nombre);
      s.turnos.push(t);
      s.horas += t.horas;
      if (!t.salida) s.enTurno = true;
      if (!s.entrada || t.entrada < s.entrada) s.entrada = t.entrada;
      if (t.salida && (!s.salida || t.salida > s.salida)) s.salida = t.salida;
    });

    datos.ventas.forEach((v) => {
      if (!v.meseroId) return;
      const s = get(v.meseroId, v.mesero);
      s.ventas += 1;
      s.platos += v.platos;
      s.cobrado += v.monto;
      if (v.mesaId) s.mesas.add(v.mesaId);
    });

    return Array.from(mapa.values()).sort((a, b) => b.cobrado - a.cobrado);
  }, [datos]);

  const cajeros = useMemo(() => {
    const mapa = new Map<
      string,
      {
        id: string;
        nombre: string;
        rol: string;
        ventas: number;
        total: number;
        propinas: number;
        validadas: number;
        primero: string;
        ultimo: string;
      }
    >();
    datos.ventas.forEach((v) => {
      const id = v.cobradoPorId ?? "caja";
      const s = mapa.get(id) ?? {
        id,
        nombre: v.cobradoPor,
        rol: datos.perfiles[id]?.rol ?? "caja",
        ventas: 0,
        total: 0,
        propinas: 0,
        validadas: 0,
        primero: v.hora,
        ultimo: v.hora,
      };
      s.ventas += 1;
      s.total += v.monto;
      s.propinas += v.propina;
      if (v.validada) s.validadas += 1;
      if (v.hora < s.primero) s.primero = v.hora;
      if (v.hora > s.ultimo) s.ultimo = v.hora;
      mapa.set(id, s);
    });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [datos]);

  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h2 className="px-1 text-sm font-extrabold text-white">
          Meseros · entrada, salida y ventas
        </h2>
        {meseros.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-stone-400">
            No hubo meseros trabajando en este rango.
          </p>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {meseros.map((m) => (
              <article
                key={m.id}
                className="space-y-2.5 rounded-3xl border border-white/[0.07] bg-stone-900/75 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-base font-extrabold text-white">
                    {m.nombre}
                  </h3>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                      m.enTurno
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-stone-800 text-stone-300"
                    }`}
                  >
                    {m.enTurno ? "● En turno" : "Turno cerrado"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <Dato
                    etiqueta="Entró"
                    valor={fh(m.entrada)}
                    clase="text-emerald-300"
                  />
                  <Dato
                    etiqueta="Salió"
                    valor={m.enTurno ? "En curso" : fh(m.salida)}
                    clase="text-amber-300"
                  />
                  <Dato etiqueta="Horas" valor={horasTxt(m.horas)} />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Dato
                    etiqueta="Mesas"
                    valor={String(m.mesas.size)}
                    clase="text-sky-300"
                  />
                  <Dato
                    etiqueta="Platos"
                    valor={String(m.platos)}
                    clase="text-sky-300"
                  />
                  <Dato
                    etiqueta="Cobrado"
                    valor={bs(m.cobrado)}
                    clase="text-emerald-300"
                  />
                </div>

                {m.turnos.length > 1 && (
                  <details className="rounded-xl bg-stone-950 px-3 py-2 text-xs">
                    <summary className="cursor-pointer font-bold text-stone-300">
                      Ver los {m.turnos.length} turnos
                    </summary>
                    <ul className="mt-2 space-y-1 text-stone-400">
                      {m.turnos.map((t) => (
                        <li key={t.id} className="flex justify-between gap-2">
                          <span>
                            {formatFechaHora(t.entrada)} →{" "}
                            {t.salida ? formatHora(t.salida) : "en curso"}
                          </span>
                          <span className="font-bold text-stone-200">
                            {horasTxt(t.horas)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-extrabold text-white">
          Caja · apertura y cierre
        </h2>
        {datos.cierres.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-stone-400">
            No hubo turnos de caja en este rango.
          </p>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {datos.cierres.map((c) => {
              const dif =
                c.diferencia ??
                (c.efectivoContado !== null && c.efectivoEsperado !== null
                  ? c.efectivoContado - c.efectivoEsperado
                  : null);
              return (
                <article
                  key={c.id}
                  className="space-y-2.5 rounded-3xl border border-white/[0.07] bg-stone-900/75 p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-base font-extrabold text-white">
                      {c.abiertoPor}
                    </h3>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                        c.cerradoEn
                          ? "bg-stone-800 text-stone-300"
                          : "bg-emerald-400/15 text-emerald-300"
                      }`}
                    >
                      {c.cerradoEn ? "Caja cerrada" : "● Caja abierta"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <Dato
                      etiqueta="Abrió"
                      valor={fh(c.abiertoEn)}
                      clase="text-emerald-300"
                    />
                    <Dato
                      etiqueta="Cerró"
                      valor={c.cerradoEn ? fh(c.cerradoEn) : "En curso"}
                      clase="text-amber-300"
                    />
                    <Dato etiqueta="Monto inicial" valor={bs(c.montoInicial)} />
                  </div>

                  {c.cerradoEn && (
                    <>
                      <div className="grid grid-cols-3 gap-1.5">
                        <Dato
                          etiqueta="Ventas"
                          valor={bs(c.totalVentas)}
                          clase="text-emerald-300"
                        />
                        <Dato
                          etiqueta="Esperado"
                          valor={bs(c.efectivoEsperado ?? 0)}
                        />
                        <Dato
                          etiqueta="Contado"
                          valor={bs(c.efectivoContado ?? 0)}
                        />
                      </div>
                      {dif !== null && (
                        <p
                          className={`rounded-xl bg-stone-950 px-3 py-2 text-xs font-bold ${
                            Math.abs(dif) < 0.005
                              ? "text-emerald-300"
                              : dif < 0
                                ? "text-rose-300"
                                : "text-amber-300"
                          }`}
                        >
                          Diferencia: {bs(dif)}
                          {Math.abs(dif) < 0.005
                            ? " · caja cuadrada ✅"
                            : dif < 0
                              ? " · faltante"
                              : " · sobrante"}
                          {c.cerradoPor ? ` · cerró ${c.cerradoPor}` : ""}
                        </p>
                      )}
                      {c.observaciones && (
                        <p className="text-xs text-stone-400">
                          📝 {c.observaciones}
                        </p>
                      )}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-extrabold text-white">
          Caja · quién cobró
        </h2>
        {cajeros.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-stone-400">
            No hubo cobros en este rango.
          </p>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2">
            {cajeros.map((c) => (
              <article
                key={c.id}
                className="space-y-2.5 rounded-3xl border border-white/[0.07] bg-stone-900/75 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-base font-extrabold text-white">
                    {c.nombre}
                  </h3>
                  <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-extrabold uppercase text-amber-300">
                    {c.rol}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Dato
                    etiqueta="Cobrado"
                    valor={bs(c.total)}
                    clase="text-emerald-300"
                  />
                  <Dato etiqueta="Ventas" valor={String(c.ventas)} />
                  <Dato
                    etiqueta="Validadas"
                    valor={`${c.validadas}/${c.ventas}`}
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <Dato
                    etiqueta="Primer cobro"
                    valor={fh(c.primero)}
                    clase="text-sky-300"
                  />
                  <Dato
                    etiqueta="Último cobro"
                    valor={fh(c.ultimo)}
                    clase="text-sky-300"
                  />
                  <Dato
                    etiqueta="Propinas"
                    valor={bs(c.propinas)}
                    clase="text-amber-300"
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
