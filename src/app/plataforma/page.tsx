"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Building2, Loader2, Plus, ShieldOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  plataformaActions,
  useEmpresas,
  usePlataformaStore,
  type EmpresaPlataforma,
} from "@/lib/data/repos/db/plataforma";

const PROVIDER_LABEL: Record<EmpresaPlataforma["whatsappProvider"], string> = {
  meta: "Meta (oficial)",
  evolution: "Evolution",
};

export default function PlataformaPage() {
  const { empresas, loaded, loading, erro } = useEmpresas();
  const [suspendendo, setSuspendendo] = useState<EmpresaPlataforma | null>(null);

  if (loading && !loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Carregando empresas...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Empresas</h1>
          <p className="text-xs text-slate-500">
            Todas as empresas clientes cadastradas nesta plataforma.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" render={<Link href="/plataforma/nova" />}>
          <Plus className="size-3.5" /> Nova empresa
        </Button>
      </div>

      {erro ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertTriangle className="mx-auto mb-2 size-6 text-red-400" />
          <p className="text-sm font-semibold text-red-700">Não foi possível carregar as empresas</p>
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
      ) : empresas.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-8 text-center">
          <Building2 className="mx-auto mb-2 size-6 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Nenhuma empresa ainda</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            Cadastre a primeira empresa cliente para começar.
          </p>
          <Button size="sm" className="mt-3 h-8 gap-1.5 text-xs" render={<Link href="/plataforma/nova" />}>
            <Plus className="size-3.5" /> Nova empresa
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[11px] text-slate-400">
                <th className="px-4 py-2.5 font-medium">Empresa</th>
                <th className="px-4 py-2.5 font-medium">Criada em</th>
                <th className="px-4 py-2.5 font-medium">Usuários</th>
                <th className="px-4 py-2.5 font-medium">Contatos</th>
                <th className="px-4 py-2.5 font-medium">Canais</th>
                <th className="px-4 py-2.5 font-medium">Tipo de canal</th>
                <th className="px-4 py-2.5 font-medium">Módulos bloqueados</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => {
                const suspensa = !!e.suspensaEm;
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{e.nome}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {format(new Date(e.criadaEm), "d MMM yyyy", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {e.usuarios} / {e.maxUsers ?? "∞"}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{e.contatos}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {e.canaisAtivos} / {e.canais}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {PROVIDER_LABEL[e.whatsappProvider]}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {e.disabledModules.length === 0 ? "Nenhum" : e.disabledModules.length}
                    </td>
                    <td className="px-4 py-2.5">
                      {suspensa ? (
                        <Badge variant="destructive">Suspensa</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                          Ativa
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {suspensa ? (
                        <button
                          onClick={async () => {
                            const res = await plataformaActions.reativar(e.id);
                            res.ok
                              ? toast.success("Empresa reativada")
                              : toast.error(res.error ?? "Não foi possível reativar");
                          }}
                          title="Reativar empresa"
                          className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                        >
                          <ShieldCheck className="size-3.5" /> Reativar
                        </button>
                      ) : (
                        <button
                          onClick={() => setSuspendendo(e)}
                          title="Suspender empresa"
                          className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500"
                        >
                          <ShieldOff className="size-3.5" /> Suspender
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SuspenderDialog
        empresa={suspendendo}
        onOpenChange={(o) => !o && setSuspendendo(null)}
      />
    </div>
  );
}

function SuspenderDialog({
  empresa,
  onOpenChange,
}: {
  empresa: EmpresaPlataforma | null;
  onOpenChange: (o: boolean) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!empresa) return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo — o cliente vê essa mensagem na tela de bloqueio");
      return;
    }
    setSaving(true);
    const res = await plataformaActions.suspender(empresa.id, motivo.trim());
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível suspender");
      return;
    }
    toast.success("Empresa suspensa");
    setMotivo("");
    onOpenChange(false);
  };

  return (
    <Dialog open={!!empresa} onOpenChange={(o) => { if (!o) setMotivo(""); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suspender {empresa?.nome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label className="text-xs">Motivo *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Pagamento em atraso"
            className="min-h-20 text-xs"
          />
          <p className="text-[10px] text-slate-400">
            Este texto aparece para o cliente na tela de bloqueio.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={submit} disabled={saving}>
            {saving ? "Suspendendo..." : "Suspender empresa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
