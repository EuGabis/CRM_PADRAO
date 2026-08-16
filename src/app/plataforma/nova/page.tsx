"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NAV_ITEMS } from "@/lib/config/nav";
import { plataformaActions } from "@/lib/data/repos/db/plataforma";

/**
 * Módulos que consomem credencial global do dono da plataforma
 * (OPENAI_API_KEY, RESEND_API_KEY, WHATSAPP_TOKEN) — nasce bloqueado por
 * padrão em empresa nova. Liberar é assumir o custo do consumo dela.
 */
const MODULOS_BLOQUEADOS_PADRAO = ["ai-studio", "agentes-ia", "marketing", "whatsapp"];

const MODULOS_DISPONIVEIS = NAV_ITEMS.filter((i) => i.key !== "ativacao");

const PROVIDER_LABEL: Record<"meta" | "evolution", string> = {
  meta: "Meta (oficial)",
  evolution: "Evolution",
};

/**
 * "0" ou negativo não é limite válido — o próprio admin da empresa seria
 * barrado pelo trigger da 0047 na primeira tentativa de adicionar alguém.
 * Trata como vazio: nulo = ilimitado.
 */
function parseLimite(valor: string): number | null {
  const n = Number(valor);
  return valor.trim() && n > 0 ? n : null;
}

export default function NovaEmpresaPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [maxUsers, setMaxUsers] = useState("");
  const [maxChannels, setMaxChannels] = useState("");
  const [provider, setProvider] = useState<"meta" | "evolution">("meta");
  const [disabledModules, setDisabledModules] = useState<string[]>(MODULOS_BLOQUEADOS_PADRAO);
  const [saving, setSaving] = useState(false);
  const [criada, setCriada] = useState<{ email: string; senha: string } | null>(null);

  const toggleModule = (key: string) =>
    setDisabledModules((mods) =>
      mods.includes(key) ? mods.filter((m) => m !== key) : [...mods, key]
    );

  const submit = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome da empresa");
      return;
    }
    if (!email.includes("@")) {
      toast.error("Informe um e-mail válido");
      return;
    }
    if (senha.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres");
      return;
    }
    setSaving(true);
    const res = await plataformaActions.criarEmpresa({
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      senha,
      maxUsers: parseLimite(maxUsers),
      maxChannels: parseLimite(maxChannels),
      disabledModules,
      provider,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível criar a empresa");
      return;
    }
    if (res.warning) toast.warning(res.warning, { duration: 8000 });
    setCriada({ email: res.email ?? email.trim().toLowerCase(), senha });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/plataforma"
        className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
      >
        <ArrowLeft className="size-3.5" /> Voltar para empresas
      </Link>
      <h1 className="text-lg font-bold text-slate-900">Nova empresa</h1>
      <p className="mb-4 text-xs text-slate-500">
        Cria a empresa, o acesso do responsável e os limites de plano.
      </p>

      <div className="space-y-5 rounded-xl border bg-white p-5">
        <div className="space-y-1">
          <Label className="text-xs">Nome da empresa *</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Clínica Boa Saúde" className="h-8" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">E-mail do responsável *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contato@empresa.com.br"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Senha provisória *</Label>
            <Input
              type="text"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="h-8"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Limite de usuários</Label>
            <Input
              type="number"
              min={1}
              value={maxUsers}
              onChange={(e) => setMaxUsers(e.target.value)}
              placeholder="Sem limite"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Limite de canais</Label>
            <Input
              type="number"
              min={1}
              value={maxChannels}
              onChange={(e) => setMaxChannels(e.target.value)}
              placeholder="Sem limite"
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo de canal WhatsApp</Label>
            <Select value={provider} onValueChange={(v) => v && setProvider(v as "meta" | "evolution")}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>{PROVIDER_LABEL[provider]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meta" className="text-xs">
                  Meta (oficial)
                </SelectItem>
                <SelectItem value="evolution" className="text-xs">
                  Evolution
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-xs font-semibold">Módulos bloqueados</Label>
            <div className="flex gap-2 text-[10px]">
              <button
                className="text-indigo-600 hover:underline"
                onClick={() => setDisabledModules(MODULOS_DISPONIVEIS.map((m) => m.key))}
              >
                Bloquear todos
              </button>
              <button className="text-slate-400 hover:underline" onClick={() => setDisabledModules([])}>
                Liberar todos
              </button>
            </div>
          </div>
          <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border p-3">
            {MODULOS_DISPONIVEIS.map((m) => (
              <Label key={m.key} className="flex items-center gap-2 text-[11px] font-normal text-slate-600">
                <Checkbox
                  checked={disabledModules.includes(m.key)}
                  onCheckedChange={() => toggleModule(m.key)}
                />
                {m.label}
                {MODULOS_BLOQUEADOS_PADRAO.includes(m.key) && (
                  <span className="text-[9px] font-semibold text-amber-600">credencial global</span>
                )}
              </Label>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-tight text-slate-400">
            AI Studio, Agentes de IA, Marketing e WhatsApp usam chaves globais do dono da
            plataforma — por isso vêm bloqueados por padrão. Liberar é assumir o custo do
            consumo dessa empresa.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" render={<Link href="/plataforma" />}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Criando..." : "Criar empresa"}
        </Button>
      </div>

      <ConfirmacaoDialog
        dados={criada}
        onOpenChange={(o) => {
          if (!o) {
            setCriada(null);
            router.push("/plataforma");
          }
        }}
      />
    </div>
  );
}

function ConfirmacaoDialog({
  dados,
  onOpenChange,
}: {
  dados: { email: string; senha: string } | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [copiado, setCopiado] = useState(false);

  const copiar = () => {
    if (!dados) return;
    void navigator.clipboard.writeText(`E-mail: ${dados.email}\nSenha: ${dados.senha}`);
    setCopiado(true);
    toast.success("Credenciais copiadas");
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <Dialog open={!!dados} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Empresa criada</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Entregue estas credenciais ao cliente. A senha não aparece de novo depois desta
            tela.
          </p>
          <div className="space-y-2 rounded-lg border bg-slate-50 p-3 text-xs">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                E-mail
              </p>
              <p className="font-mono text-slate-800">{dados?.email}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Senha
              </p>
              <p className="font-mono text-slate-800">{dados?.senha}</p>
            </div>
          </div>
          <Button variant="outline" className="w-full gap-1.5" onClick={copiar}>
            {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copiado ? "Copiado" : "Copiar e-mail e senha"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
