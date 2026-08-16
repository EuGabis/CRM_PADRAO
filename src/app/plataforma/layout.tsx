import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { brand } from "@/lib/config/brand";

export const dynamic = "force-dynamic";

/**
 * Guarda SERVER-SIDE. Do outro lado desta porta está a lista de todos os
 * clientes — uma checagem só no client seria contornável.
 */
export default async function PlataformaLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ehDono } = await supabase.rpc("is_platform_admin_check");
  if (ehDono !== true) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white px-6 py-3">
        <span className="text-sm font-bold text-slate-900">{brand.name} · Plataforma</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
