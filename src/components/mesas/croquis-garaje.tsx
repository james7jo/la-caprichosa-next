"use client";

import { CroquisSector, type CroquisSectorProps } from "./croquis-sector";

export function CroquisGaraje(props: CroquisSectorProps) {
  return <CroquisSector {...props} zona="Garaje" orientacion="vertical" />;
}
