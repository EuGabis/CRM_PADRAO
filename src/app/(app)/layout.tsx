import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SessionManager } from "@/components/layout/session-manager";
import { AppointmentReminders } from "@/components/calendar/appointment-reminders";
import { ModuleGuard } from "@/components/layout/module-guard";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Empresa suspensa: TEM que ser checada antes de qualquer resolução de
    // location_id — suspender remove a empresa de private.user_locations(),
    // que esconde também location_members. Checar a empresa primeiro faria o
    // cliente ver "sem empresa" em vez do motivo real da suspensão.
    const { data: susp, error: suspError } = await supabase.rpc("my_suspension");
    if (suspError) {
      // Falha ABERTA de propósito: a RLS já esvazia tudo, então o pior caso é
      // o CRM vazio, não vazamento de dado — e falhar fechado derrubaria a
      // plataforma inteira num erro transitório. Mas nunca em silêncio.
      console.error("[AppLayout] my_suspension() falhou para o usuário", user.id, suspError);
    }
    // my_suspension() devolve ZERO LINHAS quando não há vínculo — tratar
    // ausência de linha como "não suspenso".
    const linha = Array.isArray(susp) ? susp[0] : susp;
    if (linha?.suspended) redirect("/suspensa");

    const { data: perfil, error: perfilError } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilError) {
      console.error(
        "[AppLayout] leitura de profiles.must_change_password falhou para o usuário",
        user.id,
        perfilError
      );
    }
    if (perfil?.must_change_password) redirect("/trocar-senha");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <SessionManager />
      {/* Lembrete de compromisso (0042): fica no shell para avisar em qualquer
          tela — um aviso que só aparece com o Calendário aberto não serviria. */}
      <AppointmentReminders />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
          <ModuleGuard>{children}</ModuleGuard>
        </main>
      </div>
    </div>
  );
}
