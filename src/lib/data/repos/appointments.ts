"use client";

import { useCrmStore } from "../store";

export function useAppointments() {
  return useCrmStore((s) => s.appointments);
}
