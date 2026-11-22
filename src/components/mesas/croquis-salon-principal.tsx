"use client";

import { CroquisSector, type CroquisSectorProps } from "./croquis-sector";

export function CroquisSalonPrincipal(props: CroquisSectorProps) {
  return (
    <CroquisSector {...props} zona="Salón Principal" orientacion="horizontal" />
  );
}
