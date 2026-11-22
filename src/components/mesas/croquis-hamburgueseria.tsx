"use client";

import { CroquisSector, type CroquisSectorProps } from "./croquis-sector";

export function CroquisHamburgueseria(props: CroquisSectorProps) {
  return (
    <CroquisSector {...props} zona="Hamburguesería" orientacion="vertical" />
  );
}
