import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Baixa profiles.must_change_password para false depois que o cliente troca
 * a senha no primeiro acesso.
 *
 * O trigger da 0052 impede o próprio usuário de alterar essa coluna (só a
 * service role, onde auth.uid() é nulo, consegue). Por isso esta rota existe:
 * valida a sessão com o client normal e só então usa createAdminClient() para
 * a escrita. Sem esta rota funcionando, o shell continua redirecionando para
 * /trocar-senha mesmo depois da senha trocada — um laço que o cliente não
 * consegue entender sozinho.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (error) {
    return Response.json(
      { error: "Não foi possível concluir a troca de senha. Tente novamente." },
      { status: 500 }
    );
  }

  return Response.json({ ok: true });
}
