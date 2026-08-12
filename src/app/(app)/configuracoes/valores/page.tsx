import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Antes esta tela listava "valores personalizados" inventados
 * ({{empresa.nome}} = "Lito Comercial", um telefone fictício etc.) com um
 * botão que só emitia toast. Cadastro de valores próprios não existe.
 *
 * O que existe de verdade são as variáveis que o motor de automações e o de
 * marketing substituem nas mensagens — a lista abaixo é exatamente a de
 * `templateVars()` em src/lib/automations/actions.ts. Se aquela função
 * mudar, atualizar aqui também.
 */
const VARIABLES: { token: string; desc: string }[] = [
  { token: "{{nome}}", desc: "Primeiro nome do contato" },
  { token: "{{sobrenome}}", desc: "Sobrenome do contato" },
  { token: "{{nome_completo}}", desc: "Nome e sobrenome" },
  { token: "{{email}}", desc: "E-mail do contato" },
  { token: "{{telefone}}", desc: "Telefone do contato" },
  { token: "{{empresa}}", desc: "Empresa do contato" },
  { token: "{{tags}}", desc: "Tags do contato, separadas por vírgula" },
  { token: "{{empresa_crm}}", desc: "Nome da sua empresa no CRM" },
];

export default function ValoresPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900">Valores personalizados</h1>
      <p className="mb-5 text-xs text-slate-500">
        Variáveis que o CRM substitui automaticamente em e-mails, mensagens e automações.
      </p>
      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              {["Variável", "Substituída por"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {VARIABLES.map((v) => (
              <tr key={v.token} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-mono text-[11px] text-indigo-700">{v.token}</td>
                <td className="px-4 py-2.5 text-slate-600">{v.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 rounded-lg border bg-slate-50 p-3 text-[11px] text-slate-500">
        Cada campo personalizado que você cria também vira uma variável com o próprio nome — por
        exemplo, um campo chamado <code>plano</code> pode ser usado como{" "}
        <code>{"{{plano}}"}</code>. Variáveis sem valor no contato são substituídas por texto vazio.
        Cadastrar valores fixos próprios (além dos campos de contato) ainda não é possível.
      </p>
      <Link
        href="/configuracoes/campos"
        className="mt-3 flex items-center justify-between rounded-xl border bg-white p-4 text-xs hover:border-indigo-300"
      >
        <span className="font-medium text-slate-700">Gerenciar campos personalizados</span>
        <ArrowRight className="size-4 text-slate-400" />
      </Link>
    </div>
  );
}
