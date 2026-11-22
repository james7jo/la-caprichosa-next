export const ZONA_HORARIA_BO = "America/La_Paz";
export const HORA_APERTURA_BO = 12; // 12:00 PM
export const HORA_CIERRE_BO = 22; // 10:00 PM

export function obtenerInfoHoraBolivia(fecha: Date = new Date()) {
  const formatoHora = new Intl.DateTimeFormat("es-BO", {
    timeZone: ZONA_HORARIA_BO,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const formatoFecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_BO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA_BO,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(fecha);

  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);

  // Fuera de horario normal (antes de las 12:00 o desde las 22:00 en adelante)
  const fueraDeHorario = hora < HORA_APERTURA_BO || hora >= HORA_CIERRE_BO;

  return {
    fechaBolivia: formatoFecha.format(fecha), // YYYY-MM-DD
    horaBoliviaTexto: formatoHora.format(fecha), // HH:mm:ss
    horaNum: hora,
    minutoNum: minuto,
    fueraDeHorario,
  };
}