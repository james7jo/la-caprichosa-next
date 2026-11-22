"use client";

import { CroquisSector, type CroquisSectorProps } from "./croquis-sector";

export function CroquisJardin(props: CroquisSectorProps) {
  return <CroquisSector {...props} zona="Jardín" orientacion="vertical" />;
}
