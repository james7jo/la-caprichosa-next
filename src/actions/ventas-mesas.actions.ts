"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SeleccionPersonalizacion = {
  grupo: string;
  seleccion: string | string[];
  extraBs: number;
};

export type AgregarItemPedidoInput = {
  pedidoId?: string | null;
  mesaId?: string | null;
  clienteNombre?: string | null;
  notas?: string | null;
  menuItemId: string;
  cantidad: number;
  personalizaciones?: SeleccionPersonalizacion[];
  notasItem?: string | null;
  marcarOcupadaAlMandar?: boolean;
};

function refrescarOperacion() {
  revalidatePath("/admin/ventas");
  revalidatePath("/admin/reportes");
  revalidatePath("/admin/menu");
  revalidatePath("/meseros");
  revalidatePath("/meseros/mesas");
  revalidatePath("/meseros/mi-rendicion");
  revalidatePath("/caja");
  revalidatePath("/admin");
}

function inferirLineaNegocio(categoria: string): "parrilla" | "hamburguesas" {
  const c = categoria.trim().toLowerCase();
  if (
    c.includes("hamburg") ||
    c.includes("burger") ||
    c.includes("rápida") ||
    c.includes("rapida")
  ) {
    return "hamburguesas";
  }
  return "parrilla";
}

async function obtenerUsuarioActual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida." as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nombre, rol, activo")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.activo) {
    return { error: "Usuario inactivo o sin perfil." as const };
  }

  return {
    supabase,
    userId: user.id,
    nombre: profile.nombre || user.email || "Operador",
    rol: profile.rol || "mesero",
  };
}

async function verificarOperacionAbiertaSiMesero(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  rol: string,
) {
  if (rol !== "mesero") return { ok: true as const };

  const { data: opAbierta } = await supabase
    .from("operaciones_mesero")
    .select("id")
    .eq("mesero_id", userId)
    .eq("estado", "abierta")
    .maybeSingle();

  if (!opAbierta) {
    return {
      ok: false as const,
      error:
        "Debes INICIAR OPERACIÓN desde tu inicio de mesero antes de tomar pedidos.",
    };
  }

  return { ok: true as const };
}

async function recalcularTotalPedido(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pedidoId: string | null,
) {
  if (!pedidoId) return 0;

  const { data: detalles } = await supabase
    .from("detalle_pedidos")
    .select("subtotal")
    .eq("pedido_id", pedidoId);

  const nuevoTotal = (detalles ?? []).reduce(
    (acc, d) => acc + Number(d.subtotal || 0),
    0,
  );

  await supabase
    .from("pedidos")
    .update({ total: nuevoTotal, updated_at: new Date().toISOString() })
    .eq("id", pedidoId);

  return nuevoTotal;
}

export async function crearMesa(input: {
  numero: number;
  nombre?: string;
  zona: string;
  capacidad: number;
  habilitada?: boolean;
  soloFinDeSemana?: boolean;
  posX?: number;
  posY?: number;
}) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const numero = Math.floor(Number(input.numero));
  const capacidad = Math.max(1, Math.floor(Number(input.capacidad) || 4));
  const zona = input.zona.trim() || "Salón Principal";
  const nombre = input.nombre?.trim() || `Mesa ${numero}`;

  if (!Number.isFinite(numero) || numero <= 0) {
    return { error: "Ingresa un número de mesa válido." };
  }

  const { error } = await auth.supabase.from("mesas").insert({
    numero,
    nombre,
    zona,
    capacidad,
    estado: "disponible",
    habilitada: input.habilitada ?? true,
    solo_fin_de_semana: input.soloFinDeSemana ?? false,
    pos_x: input.posX ?? 50,
    pos_y: input.posY ?? 50,
  });

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function guardarPosicionMesa(
  mesaId: string,
  posX: number,
  posY: number,
) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const x = Math.min(90, Math.max(8, Math.round(Number(posX) || 50)));
  const y = Math.min(88, Math.max(10, Math.round(Number(posY) || 50)));

  const { error } = await auth.supabase
    .from("mesas")
    .update({ pos_x: x, pos_y: y, updated_at: new Date().toISOString() })
    .eq("id", mesaId);

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function editarMesa(
  mesaId: string,
  input: {
    numero: number;
    nombre: string;
    zona: string;
    capacidad: number;
    habilitada: boolean;
    soloFinDeSemana: boolean;
  },
) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const numero = Math.floor(Number(input.numero));
  if (!Number.isFinite(numero) || numero <= 0) {
    return { error: "Número de mesa inválido." };
  }

  const { error } = await auth.supabase
    .from("mesas")
    .update({
      numero,
      nombre: input.nombre.trim() || `Mesa ${numero}`,
      zona: input.zona.trim() || "Salón Principal",
      capacidad: Math.max(1, Math.floor(Number(input.capacidad) || 4)),
      habilitada: Boolean(input.habilitada),
      solo_fin_de_semana: Boolean(input.soloFinDeSemana),
      updated_at: new Date().toISOString(),
    })
    .eq("id", mesaId);

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function eliminarMesa(mesaId: string) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: mesa } = await auth.supabase
    .from("mesas")
    .select("estado")
    .eq("id", mesaId)
    .single();

  if (mesa?.estado === "ocupada") {
    return { error: "No puedes eliminar una mesa ocupada con pedido activo." };
  }

  const { error } = await auth.supabase.from("mesas").delete().eq("id", mesaId);
  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function toggleHabilitarMesa(mesaId: string, habilitada: boolean) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("mesas")
    .update({
      habilitada,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mesaId);

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function toggleZonaHabilitada(zona: string, habilitada: boolean) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { error } = await auth.supabase
    .from("mesas")
    .update({ habilitada, updated_at: new Date().toISOString() })
    .eq("zona", zona);

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function marcarMesaLimpia(mesaId: string) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: mesa, error: readErr } = await auth.supabase
    .from("mesas")
    .select("id, estado")
    .eq("id", mesaId)
    .single();

  if (readErr || !mesa) {
    return { error: "Mesa no encontrada." };
  }

  if (mesa.estado === "ocupada") {
    return {
      error:
        "La mesa sigue ocupada. Primero debe cerrarse/pagarse la cuenta en caja para pasar a sucia.",
    };
  }

  const { error } = await auth.supabase
    .from("mesas")
    .update({
      estado: "disponible",
      mesero_actual_id: null,
      unida_con_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mesaId);

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function liberarMesaSinConsumo(mesaId: string) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: mesa, error: mesaErr } = await auth.supabase
    .from("mesas")
    .select("id, estado, unida_con_id")
    .eq("id", mesaId)
    .single();

  if (mesaErr || !mesa) {
    return { error: "Mesa no encontrada." };
  }

  if (mesa.estado === "sucia") {
    return {
      error:
        "Esta mesa está sucia tras un pago; usa 'Ya limpié la mesa' al limpiarla.",
    };
  }

  const cabezaId = mesa.unida_con_id ?? mesa.id;

  const { data: pedidoActivo } = await auth.supabase
    .from("pedidos")
    .select("id")
    .eq("mesa_id", cabezaId)
    .in("estado", ["abierto", "en_cocina", "por_cobrar"])
    .limit(1)
    .maybeSingle();

  if (pedidoActivo) {
    await auth.supabase
      .from("pedidos")
      .update({
        estado: "cancelado",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedidoActivo.id);
  }

  await auth.supabase
    .from("mesas")
    .update({
      unida_con_id: null,
      estado: "disponible",
      mesero_actual_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("unida_con_id", cabezaId);

  await auth.supabase
    .from("mesas")
    .update({
      unida_con_id: null,
      estado: "disponible",
      mesero_actual_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cabezaId);

  refrescarOperacion();
  return { success: true };
}

export async function marcarMesaOcupadaPorComanda(mesaId: string) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const opCheck = await verificarOperacionAbiertaSiMesero(
    auth.supabase,
    auth.userId,
    auth.rol,
  );
  if (!opCheck.ok) return { error: opCheck.error };

  await auth.supabase
    .from("mesas")
    .update({
      estado: "ocupada",
      mesero_actual_id: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("unida_con_id", mesaId);

  const { error } = await auth.supabase
    .from("mesas")
    .update({
      estado: "ocupada",
      mesero_actual_id: auth.userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mesaId);

  if (error) return { error: error.message };
  refrescarOperacion();
  return { success: true };
}

export async function unirMesas(
  mesaPrincipalId: string,
  mesaSecundariaId: string,
) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const opCheck = await verificarOperacionAbiertaSiMesero(
    auth.supabase,
    auth.userId,
    auth.rol,
  );
  if (!opCheck.ok) return { error: opCheck.error };

  if (mesaPrincipalId === mesaSecundariaId) {
    return { error: "Elige otra mesa distinta para unir." };
  }

  const { data: mesasData, error: readErr } = await auth.supabase
    .from("mesas")
    .select("id, numero, estado, habilitada, mesero_actual_id, unida_con_id")
    .in("id", [mesaPrincipalId, mesaSecundariaId]);

  if (readErr || !mesasData || mesasData.length < 2) {
    return { error: readErr?.message || "No se encontraron ambas mesas." };
  }

  const prin = mesasData.find((m) => m.id === mesaPrincipalId);
  const sec = mesasData.find((m) => m.id === mesaSecundariaId);

  if (!prin || !prin.habilitada) {
    return { error: "La mesa principal no está habilitada." };
  }
  if (!sec || !sec.habilitada) {
    return { error: "La mesa secundaria no está habilitada." };
  }
  if (sec.estado === "sucia") {
    return { error: "La mesa secundaria está sucia." };
  }

  const cabezaRealId = prin.unida_con_id ?? prin.id;
  const meseroId = prin.mesero_actual_id ?? auth.userId;

  const { error: errPrin } = await auth.supabase
    .from("mesas")
    .update({
      mesero_actual_id: meseroId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cabezaRealId);

  if (errPrin) return { error: errPrin.message };

  const { error: errSec } = await auth.supabase
    .from("mesas")
    .update({
      unida_con_id: cabezaRealId,
      mesero_actual_id: meseroId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mesaSecundariaId);

  if (errSec) return { error: errSec.message };

  refrescarOperacion();
  return { success: true, cabezaId: cabezaRealId };
}

export async function separarMesas(mesaPrincipalId: string) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: unidas } = await auth.supabase
    .from("mesas")
    .select("id, estado")
    .eq("unida_con_id", mesaPrincipalId);

  if (unidas && unidas.length > 0) {
    const ids = unidas.map((u) => u.id);
    await auth.supabase
      .from("mesas")
      .update({
        unida_con_id: null,
        estado: "disponible",
        mesero_actual_id: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
  }

  const { data: pedidoActivo } = await auth.supabase
    .from("pedidos")
    .select("id")
    .eq("mesa_id", mesaPrincipalId)
    .in("estado", ["abierto", "en_cocina", "por_cobrar"])
    .limit(1)
    .maybeSingle();

  if (!pedidoActivo) {
    await auth.supabase
      .from("mesas")
      .update({
        unida_con_id: null,
        estado: "disponible",
        mesero_actual_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mesaPrincipalId);
  }

  refrescarOperacion();
  return { success: true };
}

export async function agregarItemAPedido(input: AgregarItemPedidoInput) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const opCheck = await verificarOperacionAbiertaSiMesero(
    auth.supabase,
    auth.userId,
    auth.rol,
  );
  if (!opCheck.ok) return { error: opCheck.error };

  const cantidad = Math.max(1, Math.floor(Number(input.cantidad) || 1));

  const { data: itemMenu, error: itemErr } = await auth.supabase
    .from("menu_items")
    .select(
      "id, nombre, categoria, tipo_item, precio_base, stock_actual, controlar_stock, activo",
    )
    .eq("id", input.menuItemId)
    .single();

  if (itemErr || !itemMenu) {
    return { error: "Producto del menú no encontrado." };
  }

  if (itemMenu.controlar_stock && itemMenu.stock_actual < cantidad) {
    return {
      error: `Stock insuficiente para "${itemMenu.nombre}" (disponible: ${itemMenu.stock_actual}).`,
    };
  }

  let pedidoId = input.pedidoId ?? null;

  if (!pedidoId && input.mesaId) {
    const { data: pedidoExistente } = await auth.supabase
      .from("pedidos")
      .select("id")
      .eq("mesa_id", input.mesaId)
      .in("estado", ["abierto", "en_cocina", "por_cobrar"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pedidoExistente) {
      pedidoId = pedidoExistente.id;
    }
  }

  if (!pedidoId) {
    const { data: nuevoPedido, error: pedErr } = await auth.supabase
      .from("pedidos")
      .insert({
        origen: input.mesaId ? "salon" : "mostrador",
        estado: "abierto",
        mesa_id: input.mesaId ?? null,
        mesero_id: auth.userId,
        cliente_nombre: input.clienteNombre?.trim() || null,
        notas: input.notas?.trim() || null,
        total: 0,
      })
      .select("id")
      .single();

    if (pedErr || !nuevoPedido) {
      return { error: pedErr?.message ?? "No se pudo abrir el pedido." };
    }
    pedidoId = nuevoPedido.id;
  }

  const extrasTotal = (input.personalizaciones ?? []).reduce(
    (acc, p) => acc + (Number(p.extraBs) || 0),
    0,
  );
  const precioUnitario = Number(itemMenu.precio_base) + extrasTotal;
  const subtotal = precioUnitario * cantidad;

  const { error: detErr } = await auth.supabase.from("detalle_pedidos").insert({
    pedido_id: pedidoId,
    menu_item_id: itemMenu.id,
    nombre_item: itemMenu.nombre,
    linea_negocio: inferirLineaNegocio(itemMenu.categoria),
    cantidad,
    precio_unitario: precioUnitario,
    subtotal,
    notas_item: input.notasItem?.trim() || null,
    personalizacion_json: input.personalizaciones ?? [],
  });

  if (detErr) return { error: detErr.message };

  if (itemMenu.controlar_stock) {
    const nuevoStock = Math.max(0, Number(itemMenu.stock_actual) - cantidad);
    await auth.supabase
      .from("menu_items")
      .update({ stock_actual: nuevoStock, updated_at: new Date().toISOString() })
      .eq("id", itemMenu.id);
  }

  await recalcularTotalPedido(auth.supabase, pedidoId);

  const marcarOcupada = input.marcarOcupadaAlMandar ?? false;
  if (input.mesaId && marcarOcupada) {
    await auth.supabase
      .from("mesas")
      .update({
        estado: "ocupada",
        mesero_actual_id: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("unida_con_id", input.mesaId);

    await auth.supabase
      .from("mesas")
      .update({
        estado: "ocupada",
        mesero_actual_id: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.mesaId);
  }

  refrescarOperacion();
  return { success: true, pedidoId };
}

export async function actualizarMeseroPedido(
  pedidoId: string,
  nuevoMeseroId: string,
) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  if (auth.rol !== "admin" && auth.rol !== "cajera") {
    return {
      error: "Solo administración o caja pueden reasignar el mesero a cargo.",
    };
  }

  const { data: pedido, error: pedErr } = await auth.supabase
    .from("pedidos")
    .select("id, mesa_id, estado")
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) return { error: "Pedido no encontrado." };
  if (pedido.estado === "pagado" || pedido.estado === "cancelado") {
    return { error: "No puedes cambiar el mesero de un pedido cerrado." };
  }

  const { error: updPed } = await auth.supabase
    .from("pedidos")
    .update({
      mesero_id: nuevoMeseroId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pedidoId);

  if (updPed) return { error: updPed.message };

  if (pedido.mesa_id) {
    await auth.supabase
      .from("mesas")
      .update({
        mesero_actual_id: nuevoMeseroId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.mesa_id);
  }

  refrescarOperacion();
  return { success: true };
}

export async function eliminarItemPedido(detalleId: string) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: det, error: detErr } = await auth.supabase
    .from("detalle_pedidos")
    .select("id, pedido_id, menu_item_id, cantidad")
    .eq("id", detalleId)
    .single();

  if (detErr || !det) return { error: "Ítem del pedido no encontrado." };

  const { data: pedido } = await auth.supabase
    .from("pedidos")
    .select("id, estado")
    .eq("id", det.pedido_id)
    .single();

  if (!pedido || pedido.estado === "pagado" || pedido.estado === "cancelado") {
    return { error: "No se pueden quitar ítems de un pedido cerrado." };
  }

  if (det.menu_item_id) {
    const { data: itemMenu } = await auth.supabase
      .from("menu_items")
      .select("id, stock_actual, controlar_stock")
      .eq("id", det.menu_item_id)
      .maybeSingle();

    if (itemMenu?.controlar_stock) {
      await auth.supabase
        .from("menu_items")
        .update({
          stock_actual:
            Number(itemMenu.stock_actual || 0) + Number(det.cantidad || 1),
          updated_at: new Date().toISOString(),
        })
        .eq("id", itemMenu.id);
    }
  }

  const { error: delErr } = await auth.supabase
    .from("detalle_pedidos")
    .delete()
    .eq("id", detalleId);

  if (delErr) return { error: delErr.message };

  await recalcularTotalPedido(auth.supabase, det.pedido_id);
  refrescarOperacion();
  return { success: true };
}

export async function cambiarItemPedido(input: {
  detalleId: string;
  nuevoMenuItemId: string;
  cantidad?: number;
  personalizaciones?: SeleccionPersonalizacion[];
  notasItem?: string | null;
}) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: detActual, error: detErr } = await auth.supabase
    .from("detalle_pedidos")
    .select("id, pedido_id, menu_item_id, cantidad, notas_item")
    .eq("id", input.detalleId)
    .single();

  if (detErr || !detActual) return { error: "Ítem actual no encontrado." };

  const { data: pedido } = await auth.supabase
    .from("pedidos")
    .select("id, estado")
    .eq("id", detActual.pedido_id)
    .single();

  if (!pedido || pedido.estado === "pagado" || pedido.estado === "cancelado") {
    return { error: "No se pueden modificar ítems de un pedido cerrado." };
  }

  const cantidadNueva = Math.max(
    1,
    Math.floor(Number(input.cantidad ?? detActual.cantidad) || 1),
  );

  const { data: nuevoItemMenu, error: menuErr } = await auth.supabase
    .from("menu_items")
    .select(
      "id, nombre, categoria, precio_base, stock_actual, controlar_stock, activo",
    )
    .eq("id", input.nuevoMenuItemId)
    .single();

  if (menuErr || !nuevoItemMenu) {
    return { error: "Producto de reemplazo no encontrado." };
  }

  if (detActual.menu_item_id) {
    const { data: anteriorMenu } = await auth.supabase
      .from("menu_items")
      .select("id, stock_actual, controlar_stock")
      .eq("id", detActual.menu_item_id)
      .maybeSingle();

    if (anteriorMenu?.controlar_stock) {
      await auth.supabase
        .from("menu_items")
        .update({
          stock_actual:
            Number(anteriorMenu.stock_actual || 0) +
            Number(detActual.cantidad || 1),
          updated_at: new Date().toISOString(),
        })
        .eq("id", anteriorMenu.id);
    }
  }

  const { data: frescuraNuevo } = await auth.supabase
    .from("menu_items")
    .select("id, stock_actual, controlar_stock")
    .eq("id", nuevoItemMenu.id)
    .single();

  if (frescuraNuevo?.controlar_stock) {
    if (Number(frescuraNuevo.stock_actual || 0) < cantidadNueva) {
      return {
        error: `Stock insuficiente para "${nuevoItemMenu.nombre}" (disponible: ${frescuraNuevo.stock_actual}).`,
      };
    }
    await auth.supabase
      .from("menu_items")
      .update({
        stock_actual: Math.max(
          0,
          Number(frescuraNuevo.stock_actual || 0) - cantidadNueva,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", nuevoItemMenu.id);
  }

  const extrasTotal = (input.personalizaciones ?? []).reduce(
    (acc, p) => acc + (Number(p.extraBs) || 0),
    0,
  );
  const precioUnitario = Number(nuevoItemMenu.precio_base) + extrasTotal;
  const subtotal = precioUnitario * cantidadNueva;

  const { error: updDet } = await auth.supabase
    .from("detalle_pedidos")
    .update({
      menu_item_id: nuevoItemMenu.id,
      nombre_item: nuevoItemMenu.nombre,
      linea_negocio: inferirLineaNegocio(nuevoItemMenu.categoria),
      cantidad: cantidadNueva,
      precio_unitario: precioUnitario,
      subtotal,
      notas_item:
        input.notasItem !== undefined
          ? input.notasItem?.trim() || null
          : detActual.notas_item,
      personalizacion_json: input.personalizaciones ?? [],
    })
    .eq("id", detActual.id);

  if (updDet) return { error: updDet.message };

  await recalcularTotalPedido(auth.supabase, detActual.pedido_id);
  refrescarOperacion();
  return { success: true };
}

export async function cobrarPedido(
  pedidoId: string,
  metodo: "efectivo" | "qr" | "transferencia" | "tarjeta",
  propina: number = 0,
) {
  const auth = await obtenerUsuarioActual();
  if ("error" in auth) return { error: auth.error };

  const { data: pedido, error: pedErr } = await auth.supabase
    .from("pedidos")
    .select("id, mesa_id, mesero_id, total, estado")
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) {
    return { error: "Pedido no encontrado." };
  }

  const monto = Number(pedido.total || 0);
  const propinaLimpia = Math.max(0, Number(propina) || 0);
  const validaCaja = auth.rol === "admin" || auth.rol === "cajera";

  const { error: cobroErr } = await auth.supabase.from("cobros").insert({
    pedido_id: pedido.id,
    mesero_id: pedido.mesero_id ?? auth.userId,
    registrado_por: auth.userId,
    metodo,
    monto,
    propina: propinaLimpia,
    validado_en_caja: validaCaja,
    validado_por: validaCaja ? auth.userId : null,
    validado_en: validaCaja ? new Date().toISOString() : null,
  });

  if (cobroErr) return { error: cobroErr.message };

  const { error: updPedErr } = await auth.supabase
    .from("pedidos")
    .update({ estado: "pagado", updated_at: new Date().toISOString() })
    .eq("id", pedido.id);

  if (updPedErr) return { error: updPedErr.message };

  if (pedido.mesa_id) {
    await auth.supabase
      .from("mesas")
      .update({
        unida_con_id: null,
        estado: "sucia",
        updated_at: new Date().toISOString(),
      })
      .eq("unida_con_id", pedido.mesa_id);

    await auth.supabase
      .from("mesas")
      .update({
        estado: "sucia",
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.mesa_id);
  }

  refrescarOperacion();
  return { success: true };
}