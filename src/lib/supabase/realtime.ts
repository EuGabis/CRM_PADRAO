"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aplica o token da sessão ao socket do Realtime e mantém ele válido.
 *
 * POR QUE ISSO PRECISA SER EXPLÍCITO
 *
 * O socket é aberto no momento do `subscribe()`. Se o token ainda não tiver
 * sido aplicado, ele conecta como visitante anônimo: a inscrição é ACEITA
 * (o callback recebe "SUBSCRIBED", o indicador "Ao vivo" acende) mas a RLS
 * filtra todas as linhas e nenhum evento chega. O sintoma é traiçoeiro —
 * parece que está tudo conectado e a mensagem só aparece ao atualizar a
 * página, porque aí a consulta normal roda com o token certo.
 *
 * O `onAuthStateChange` existe pelo segundo motivo: o access token expira em
 * uma hora. Sem reaplicar, o tempo real funciona e morre sozinho no meio do
 * expediente, sem erro nenhum na tela.
 *
 * Chame ANTES de `.subscribe()`.
 */
export async function autenticarRealtime(supabase: SupabaseClient): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    await supabase.realtime.setAuth(session.access_token);
  }

  supabase.auth.onAuthStateChange((_evento, novaSessao) => {
    if (novaSessao?.access_token) {
      void supabase.realtime.setAuth(novaSessao.access_token);
    }
  });
}

/**
 * Callback padrão do `.subscribe()`. Existe porque a versão anterior só
 * reagia ao sucesso e engolia `CHANNEL_ERROR`/`TIMED_OUT` — o tempo real
 * caía em silêncio e não havia como saber pela tela nem pelo console.
 */
export function statusRealtime(
  nome: string,
  aoMudar: (ligado: boolean) => void,
): (status: string, err?: Error) => void {
  return (status, err) => {
    if (status === "SUBSCRIBED") {
      aoMudar(true);
      return;
    }
    aoMudar(false);
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      console.error(`[realtime] ${nome}: ${status}`, err?.message ?? "");
    }
  };
}
