import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Tudo, exceto assets estáticos e imagens — inclui /login e todas as rotas do app.
  // `api/automations` fica de fora: é chamada máquina-a-máquina (pg_cron), sem
  // sessão de usuário — a própria rota valida o cabeçalho x-automation-secret.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/automations|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
