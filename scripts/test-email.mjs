// Envia um e-mail de teste com o template real de convite.
// Uso: node scripts/test-email.mjs destinatario@exemplo.com
//
// Lê RESEND_API_KEY e EMAIL_FROM do .env.local. O EMAIL_FROM precisa usar um
// domínio verificado na sua conta do Resend; o remetente de teste @resend.dev
// só entrega ao dono da conta.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resend } from "resend";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const read = (key) => env.match(new RegExp(`^${key}=(.+)$`, "m"))?.[1]?.trim().replace(/^"|"$/g, "");

const apiKey = read("RESEND_API_KEY");
if (!apiKey) {
  console.error("RESEND_API_KEY não encontrada no .env.local");
  process.exit(1);
}

const from = read("EMAIL_FROM");
if (!from) {
  console.error("EMAIL_FROM não encontrada no .env.local — não há remetente padrão embutido.");
  process.exit(1);
}

const to = process.argv[2];
if (!to) {
  console.error("Informe o destinatário: node scripts/test-email.mjs voce@exemplo.com");
  process.exit(1);
}

// Reaproveita o template TypeScript sem precisar compilar o projeto
const src = readFileSync(new URL("../src/lib/email/invite-template.ts", import.meta.url), "utf8");
// O regex precisa casar com a linha de import REAL do template. Ela já mudou
// uma vez (passou a trazer emailBrand junto) e este replace virou no-op em
// silêncio: o import sobrevivia e o import dinâmico estourava.
const IMPORT_RE = /^import \{[^}]*\} from "@\/lib\/config\/brand";\n/m;
if (!IMPORT_RE.test(src)) {
  console.error("O import de brand no invite-template.ts mudou — ajuste IMPORT_RE em scripts/test-email.mjs");
  process.exit(1);
}
const js = src
  .replace(
    IMPORT_RE,
    'const brand = { name: "CRM ON", shortName: "ON", tagline: "Seu negócio inteiro em um lugar" };\n' +
      'const emailBrand = { name: brand.name, shortName: brand.shortName, address: "" };\n'
  )
  .replace(/export interface[\s\S]*?\n\}\n/, "")
  .replace(/: InviteEmailData/g, "")
  .replace(/: \{ subject: string; html: string; text: string \}/g, "")
  .replace(/: string/g, "")
  .replace(/export function/g, "function");

const tmpFile = join(tmpdir(), `crm-invite-template-${Date.now()}.mjs`);
writeFileSync(tmpFile, `${js}\nexport { renderInviteEmail };`);

try {
  const { renderInviteEmail } = await import(`file://${tmpFile}`);
  const { subject, html, text } = renderInviteEmail({
    inviterName: "Gabriel Pereira",
    companyName: "Empresa Exemplo",
    role: "user",
    signupUrl: "http://localhost:3000/login",
    email: to,
  });

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: from,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error("Falha no envio:", error.message);
    process.exitCode = 1;
  } else {
    console.log(`OK: e-mail enviado para ${to} (id ${data?.id})`);
  }
} finally {
  try {
    unlinkSync(tmpFile);
  } catch {}
}
