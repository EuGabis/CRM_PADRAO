// Aplica um arquivo SQL no banco do Supabase usando DATABASE_URL do .env.local
// Uso: node scripts/apply-migration.mjs supabase/migrations/0001_initial_schema.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const dbUrl = envFile.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) {
  console.error("DATABASE_URL não encontrada no .env.local");
  process.exit(1);
}

const file = process.argv[2];
if (!file) {
  console.error("Informe o arquivo SQL");
  process.exit(1);
}
const sql = readFileSync(file, "utf8");

// TLS com verificação completa: exige o certificado CA do projeto
// (Dashboard → Settings → Database → SSL Configuration → Download certificate)
// salvo como scripts/supabase-ca.crt
let ca;
try {
  ca = readFileSync(new URL("./supabase-ca.crt", import.meta.url), "utf8");
} catch {
  console.error(
    "Certificado CA não encontrado em scripts/supabase-ca.crt.\n" +
      "Baixe em: Dashboard → Settings → Database → SSL Configuration."
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { ca, rejectUnauthorized: true },
});

try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log("OK: migração aplicada com sucesso");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {}
  console.error("ERRO:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
