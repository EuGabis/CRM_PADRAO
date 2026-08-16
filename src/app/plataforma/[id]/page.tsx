"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  plataformaActions,
  useEmpresas,
  usePlataformaStore,
  type EmpresaPlataforma,
} from "@/lib/data/repos/db/plataforma";

/** Mesma lista da tela de cadastro: módulos que gastam credencial global do dono. */
const MODULOS_CREDENCIAL_GLOBAL = ["ai-studio", "agentes-ia", "marketing", "whatsapp"];

const MODULOS_DISPONIVEIS = NAV_ITEMS.filter((i) => i.key !== "ativacao");

const PROVIDER_LABEL: Record<"meta" | "evolution", string> = {
  meta: "Meta (oficial)",
  evolution: "Evolution",
};

/** "0" ou negativo não é limite válido — trata como vazio: nulo = ilimitado. */
function parseLimite(valor: string): number | null {
  const n = Number(valor);
  return valor.trim() && n > 0 ? n : null;
}

export default function EmpresaDetalhePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";

  // Zustand: seleciona o array cru e deriva com useMemo. Filtrar/mapear dentro
  // do selector devolveria referência nova a cada render e travaria a página.
  const { empresas, loaded, loading, erro } = useEmpresas();
  const empresa = useMemo(
    () => empresas.find((e) => e.id === id) ?? null,
    [empresas, id]
  );

  if (loading && !loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Carregando empresa...
      </div>
    );
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <AlertTriangle className="mx-auto mb-2 size-6 text-red-400" />
        <p className="text-sm font-semibold text-red-700">Não foi possível carregar a empresa</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-red-600">{erro}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 h-8 text-xs"
          onClick={() => void usePlataformaStore.getState().load(true)}
        >
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!empresa) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-dashed bg-white p-8 text-center">
        <p className="text-sm font-semibold text-slate-700">Empresa não encontrada</p>
        <p className="mt-1 text-xs text-slate-500">
          Ela pode ter sido removida ou o endereço está errado.
        </p>
        <Button size="sm" className="mt-3 h-8 text-xs" render={<Link href="/plataforma" />}>
          Voltar para empresas
        </Button>
      </div>
    );
  }

  // key: remonta o formulário quando a empresa recarrega do banco, para os
  // campos partirem sempre do estado salvo.
  return <FormularioEmpresa key={empresa.id} empresa={empresa} />;
}

function FormularioEmpresa({ empresa }: { empresa: EmpresaPlataforma }) {
  const [maxUsers, setMaxUsers] = useState(empresa.maxUsers?.toString() ?? "");
  const [maxChannels, setMaxChannels] = useState(empresa.maxChannels?.toString() ?? "");
  const [provider, setProvider] = useState<"meta" | "evolution">(empresa.whatsappProvider);
  const [disabledModules, setDisabledModules] = useState<string[]>(empresa.disabledModules);
  const [saving, setSaving] = useState(false);

  const suspensa = !!empresa.suspensaEm;

  const toggleModule = (key: string) =>
    setDisabledModules((mods) =>
      mods.includes(key) ? mods.filter((m) => m !== key) : [...mods, key]
    );

  const salvar = async () => {
    setSaving(true);
    const res = await plataformaActions.salvarLimites(empresa.id, {
      maxUsers: parseLimite(maxUsers),
      maxChannels: parseLimite(maxChannels),
      disabledModules,
      whatsappProvider: provider,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível salvar o plano");
      return;
    }
    toast.success("Plano da empresa atualizado");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/plataforma"
        className="mb-3 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
      >
        <ArrowLeft className="size-3.5" /> Voltar para empresas
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-900">{empresa.nome}</h1>
        {suspensa ? (
          <Badge variant="destructive">Suspensa</Badge>
        ) : (
          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
            Ativa
          </Badge>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Resumo titulo="Criada em" valor={format(new Date(empresa.criadaEm), "d MMM yyyy", { locale: ptBR })} />
        <Resumo titulo="Usuários" valor={`${empresa.usuarios} / ${empresa.maxUsers ?? "∞"}`} />
        <Resumo titulo="Contatos" valor={String(empresa.contatos)} />
        <Resumo titulo="Canais" valor={`${empresa.canaisAtivos} / ${empresa.canais}`} />
      </div>

      {suspensa && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-amber-800">Empresa suspensa</p>
          <p className="mt-0.5 text-xs text-amber-700">
            {empresa.motivoSuspensao ?? "Sem motivo registrado."} Reative pela lista de
            empresas — o plano abaixo continua editável.
          </p>
        </div>
      )}

      <div className="space-y-5 rounded-xl border bg-white p-5">
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
            <Select
              value={provider}
              onValueChange={(v) => v && setProvider(v as "meta" | "evolution")}
            >
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
              <button
                className="text-slate-400 hover:underline"
                onClick={() => setDisabledModules([])}
              >
                Liberar todos
              </button>
            </div>
          </div>
          <div className="grid max-h-56 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border p-3">
            {MODULOS_DISPONIVEIS.map((m) => (
              <Label
                key={m.key}
                className="flex items-center gap-2 text-[11px] font-normal text-slate-600"
              >
                <Checkbox
                  checked={disabledModules.includes(m.key)}
                  onCheckedChange={() => toggleModule(m.key)}
                />
                {m.label}
                {MODULOS_CREDENCIAL_GLOBAL.includes(m.key) && (
                  <span className="text-[9px] font-semibold text-amber-600">credencial global</span>
                )}
              </Label>
            ))}
          </div>
          <p className="mt-1 text-[10px] leading-tight text-slate-400">
            AI Studio, Agentes de IA, Marketing e WhatsApp usam chaves globais do dono da
            plataforma. Liberar um módulo para esta empresa é assumir o custo do consumo
            dela.
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" render={<Link href="/plataforma" />}>
          Cancelar
        </Button>
        <Button onClick={salvar} disabled={saving}>
          {saving ? "Salvando..." : "Salvar plano"}
        </Button>
      </div>
    </div>
  );
}

function Resumo({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{valor}</p>
    </div>
  );
}
