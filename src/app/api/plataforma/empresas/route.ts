import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformAdmin } from "@/lib/plataforma/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    nome?: string;
    email?: string;
    senha?: string;
    maxUsers?: number | null;
    maxChannels?: number | null;
    disabledModules?: string[];
    provider?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const nome = body.nome?.trim();
  const email = body.email?.trim().toLowerCase();
  const senha = body.senha ?? "";

  if (!nome) return Response.json({ error: "Informe o nome da empresa" }, { status: 400 });
  if (!email?.includes("@")) return Response.json({ error: "Informe um e-mail válido" }, { status: 400 });
  if (senha.length < 8) {
    return Response.json({ error: "A senha precisa ter ao menos 8 caracteres" }, { status: 400 });
  }

  const db = createAdminClient();

  // 1. Usuário do Auth primeiro: é o passo com maior chance de falhar
  //    (e-mail já cadastrado) e o único que precisa ser desfeito à mão.
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { name: nome },
  });

  if (authError || !created?.user) {
    const jaExiste = authError?.message?.toLowerCase().includes("already");
    return Response.json(
      { error: jaExiste ? "Já existe uma conta com este e-mail" : (authError?.message ?? "Falha ao criar o acesso") },
      { status: 400 },
    );
  }

  // 2. Empresa, vínculo e limites numa transação só.
  const { data: locationId, error: rpcError } = await db.rpc("create_client_company", {
    p_user_id: created.user.id,
    p_nome: nome,
    p_max_users: body.maxUsers ?? null,
    p_max_channels: body.maxChannels ?? null,
    p_disabled_modules: body.disabledModules ?? [],
    p_provider: body.provider ?? "meta",
  });

  if (rpcError || !locationId) {
    // Compensação: sem isto sobra um usuário sem empresa — exatamente o
    // estado órfão que precisou ser consertado à mão neste projeto.
    await db.auth.admin.deleteUser(created.user.id);
    return Response.json(
      { error: `Empresa não criada (${rpcError?.message ?? "erro desconhecido"}). Nenhum acesso foi deixado para trás.` },
      { status: 500 },
    );
  }

  return Response.json({ locationId, email });
}
