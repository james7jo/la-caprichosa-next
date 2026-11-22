// src/types/database.types.ts

// ============================================================
// Roles del sistema
// ============================================================
export type Rol = "admin" | "cajera" | "mesero";

// ============================================================
// Líneas de negocio del restaurante
// ============================================================
export type LineaNegocio = "parrilla" | "hamburguesas";

// ============================================================
// Estados de mesa
// ============================================================
export type EstadoMesa = "libre" | "ocupada" | "sucia";

// ============================================================
// Estados de pedido / comanda
// ============================================================
export type EstadoPedido =
  | "pendiente"
  | "en_cocina"
  | "listo"
  | "entregado"
  | "cobrado"
  | "cancelado";

// ============================================================
// Estados de turno (mesero o caja)
// ============================================================
export type EstadoTurno = "abierto" | "cerrado";

// ============================================================
// Tipos de movimiento de caja
// ============================================================
export type TipoMovimientoCaja = "ingreso" | "egreso";

// ============================================================
// Perfil de usuario (tabla profiles)
// ============================================================
export interface Profile {
  id: string; // uuid, FK a auth.users
  nombre: string;
  rol: Rol;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Mesa
// ============================================================
export interface Mesa {
  id: string;
  numero: number;
  estado: EstadoMesa;
  mesero_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Producto (plato o bebida)
// ============================================================
export interface Producto {
  id: string;
  nombre: string;
  linea: LineaNegocio;
  precio: number;
  stock: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Pedido (comanda)
// ============================================================
export interface Pedido {
  id: string;
  mesa_id: string | null; // null si es pedido web
  mesero_id: string | null;
  estado: EstadoPedido;
  total: number;
  es_web: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Línea de pedido (detalle)
// ============================================================
export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  notas: string | null;
}

// ============================================================
// Turno (operación de mesero o caja)
// ============================================================
export interface Turno {
  id: string;
  usuario_id: string;
  tipo: "mesero" | "caja";
  estado: EstadoTurno;
  abierto_at: string;
  cerrado_at: string | null;
  monto_inicial: number | null;
  monto_final: number | null;
}

// ============================================================
// Movimiento de caja
// ============================================================
export interface MovimientoCaja {
  id: string;
  turno_id: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
  created_at: string;
}

// ============================================================
// Rendición de mesero a caja
// ============================================================
export interface Rendicion {
  id: string;
  mesero_id: string;
  turno_caja_id: string;
  monto: number;
  validada: boolean;
  validada_por: string | null;
  created_at: string;
}