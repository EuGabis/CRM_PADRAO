import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

  // typeof === "string" é proposital: um número no lugar da senha faria
  // `.length` virar `undefined`, e `undefined < 8` é `false` — a checagem
  // de 8 caracteres seria contornada silenciosamente.
  if (typeof body.nome !== "string" || typeof body.email !== "string" || typeof body.senha !== "string") {
    return Response.json({ error: "Requisição inválida" }, { status: 400 });
  }

  const nome = body.nome.trim();
  const email = body.email.trim().toLowerCase();
  const senha = body.senha;

  if (!nome) return Response.json({ error: "Informe o nome da empresa" }, { status: 400 });
  if (!email.includes("@")) return Response.json({ error: "Informe um e-mail válido" }, { status: 400 });
  if (senha.length < 8) {
    return Response.json({ error: "A senha precisa ter ao menos 8 caracteres" }, { status: 400 });
  }

  // O dono da plataforma que está pedindo o cadastro — vira created_by do
  // convite. requirePlatformAdmin já garantiu que há sessão válida.
  const supabase = await createClient();
  const {
    data: { user: criadoPor },
  } = await supabase.auth.getUser();

  const db = createAdminClient();

  // 1. Empresa + convite de admin primeiro. O cadastro é fechado
  //    (signup_mode = 'invite_only'): criar o usuário do Auth sem convite
  //    pendente faria o trigger private.handle_new_user abortar o insert.
  //    Com o convite já esperando, o trigger faz o vínculo sozinho.
  const { data: locationId, error: prepareError } = await db.rpc("prepare_client_company", {
    p_nome: nome,
    p_email: email,
    p_criado_por: criadoPor?.id ?? null,
    p_max_users: body.maxUsers ?? null,
    p_max_channels: body.maxChannels ?? null,
    p_disabled_modules: body.disabledModules ?? [],
    p_provider: body.provider ?? "meta",
  });

  if (prepareError || !locationId) {
    // Convite pendente para o e-mail em outra empresa é condição de entrada
    // (o dono digitou um e-mail que já está esperando outro convite), não
    // falha de servidor — devolve 400 com o texto da exceção em vez do 500
    // genérico abaixo.
    if (prepareError?.message?.toLowerCase().includes("convite pendente")) {
      return Response.json({ error: prepareError.message }, { status: 400 });
    }
    return Response.json(
      { error: `Empresa não criada (${prepareError?.message ?? "erro desconhecido"}).` },
      { status: 500 },
    );
  }

  // 2. Usuário do Auth. Sem `company` nos metadados: no caminho do convite
  //    ela é ignorada pelo trigger (só é lida no ramo de cadastro público),
  //    então passá-la sugeriria um efeito que não existe.
  const { data: created, error: authError } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { name: nome },
  });

  if (authError || !created?.user) {
    const { error: discardError } = await db.rpc("discard_client_company", { p_location_id: locationId });
    if (discardError) {
      console.error(
        `[plataforma/empresas] falha ao descartar empresa ${locationId} após erro no createUser (${email}):`,
        discardError,
      );
    }
    const jaExiste = authError?.message?.toLowerCase().includes("already");
    const aviso = discardError ? " (a empresa preparada não pôde ser removida — verifique manualmente)" : "";
    return Response.json(
      {
        error: jaExiste
          ? `Já existe uma conta com este e-mail${aviso}`
          : `${authError?.message ?? "Falha ao criar o acesso"}${aviso}`,
      },
      { status: 400 },
    );
  }

  // 3. Confirmar que o trigger casou o convite. Sem isto, um descasamento
  //    de e-mail (ex.: normalização diferente) deixaria o usuário criado
  //    sem empresa em silêncio — o mesmo estado órfão que já precisou ser
  //    consertado à mão neste projeto.
  const { data: membro, error: membroError } = await db
    .from("location_members")
    .select("user_id")
    .eq("location_id", locationId)
    .eq("user_id", created.user.id)
    .maybeSingle();

  if (membroError || !membro) {
    const { error: deleteError } = await db.auth.admin.deleteUser(created.user.id);
    if (deleteError) {
      console.error(
        `[plataforma/empresas] falha ao apagar usuário órfão ${created.user.id} (${email}) após vínculo não confirmado:`,
        deleteError,
      );
    }
    const { error: discardError } = await db.rpc("discard_client_company", { p_location_id: locationId });
    if (discardError) {
      console.error(
        `[plataforma/empresas] falha ao descartar empresa ${locationId} após vínculo não confirmado:`,
        discardError,
      );
    }

    const pendencias: string[] = [];
    if (deleteError) pendencias.push(`o usuário ${email} não foi removido`);
    if (discardError) pendencias.push("a empresa preparada não foi removida");

    return Response.json(
      {
        error:
          "O convite não foi vinculado ao novo usuário. " +
          (pendencias.length
            ? `Atenção: ${pendencias.join(" e ")} — verifique manualmente.`
            : "Nada foi deixado para trás."),
      },
      { status: 500 },
    );
  }

  // 4. Novo usuário entra precisando trocar a senha provisória. A service
  //    role passa pelo trigger de proteção da 0052 porque auth.uid() é nulo
  //    fora de uma sessão de usuário.
  const { error: passwordFlagError } = await db
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", created.user.id);

  if (passwordFlagError) {
    console.error(
      `[plataforma/empresas] falha ao marcar must_change_password para ${created.user.id} (${email}):`,
      passwordFlagError,
    );
  }

  return Response.json({
    locationId,
    email,
    ...(passwordFlagError
      ? { warning: "Empresa criada, mas não foi possível marcar a troca obrigatória de senha." }
      : {}),
  });
}
