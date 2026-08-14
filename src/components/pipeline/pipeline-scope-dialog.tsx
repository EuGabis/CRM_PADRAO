"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { pipelineActions } from "@/lib/data/repos/db/pipeline";
import type { Department } from "@/lib/data/repos/db/team";
import type { Pipeline, PipelineScope } from "@/lib/data/types";

/** Etiqueta de quem enxerga o pipeline, usada na lista de pipelines. */
export function scopeBadge(
  pipeline: Pipeline,
  departments: Department[],
  team: { id: string; name: string }[]
): { label: string; className: string } {
  if (pipeline.scope === "department") {
    const name = departments.find((d) => d.id === pipeline.departmentId)?.name ?? "Departamento";
    return { label: name, className: "bg-violet-100 text-violet-700" };
  }
  if (pipeline.scope === "user") {
    const name = team.find((u) => u.id === pipeline.ownerId)?.name ?? "Pessoal";
    return { label: `Só ${name}`, className: "bg-amber-100 text-amber-700" };
  }
  return { label: "Empresa", className: "bg-slate-100 text-slate-600" };
}

/**
 * Cria um pipeline (com quem vê) ou muda quem vê um existente.
 *
 * Usuário comum não escolhe: o funil que ele cria é dele. Não é regra de tela
 * — a RLS da 0039 recusa qualquer outro escopo vindo dele. A tela só evita
 * oferecer o que o banco vai negar.
 */
export function PipelineScopeDialog({
  open,
  onOpenChange,
  mode,
  pipeline,
  isAdmin,
  myUserId,
  departments,
  team,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  pipeline: Pipeline | null;
  isAdmin: boolean;
  myUserId: string | null;
  departments: Department[];
  team: { id: string; name: string }[];
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<PipelineScope>("user");
  const [departmentId, setDepartmentId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);

  // Espelha o pipeline em edição ao (re)abrir. Ajuste durante o render em vez
  // de efeito: um setState em useEffect só para copiar prop dispara um render
  // extra a cada abertura.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const snapshotKey = `${open}-${mode}-${pipeline?.id ?? "new"}`;
  if (open && snapshot !== snapshotKey) {
    setSnapshot(snapshotKey);
    setName(mode === "edit" ? (pipeline?.name ?? "") : "");
    setScope(mode === "edit" ? (pipeline?.scope ?? "empresa") : isAdmin ? "empresa" : "user");
    setDepartmentId(pipeline?.departmentId ?? "");
    setOwnerId(pipeline?.ownerId ?? myUserId ?? "");
  }

  const invalid =
    (scope === "department" && !departmentId) ||
    (scope === "user" && !ownerId) ||
    (mode === "create" && !name.trim());

  const submit = async () => {
    setSaving(true);
    const visibility = { scope, departmentId, ownerId };
    const ok =
      mode === "create"
        ? await pipelineActions.addPipeline(name.trim(), visibility)
        : await pipelineActions.setPipelineScope(pipeline!.id, visibility);
    setSaving(false);
    if (!ok) {
      toast.error(
        mode === "create"
          ? "Não foi possível criar o pipeline"
          : "Não foi possível alterar — só administradores mudam quem vê um funil"
      );
      return;
    }
    toast.success(
      mode === "create" ? `Pipeline "${name.trim()}" criado — adicione as fases` : "Visibilidade atualizada"
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo pipeline" : "Quem vê este pipeline"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {mode === "create" && (
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Gerenciador Cibelle"
                className="h-8 text-xs"
              />
            </div>
          )}

          {isAdmin ? (
            <div className="space-y-1">
              <Label className="text-xs">Quem vê</Label>
              <Select value={scope} onValueChange={(v) => setScope((v as PipelineScope) ?? "empresa")}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue>
                    {scope === "empresa"
                      ? "Todos da empresa"
                      : scope === "department"
                        ? "Um departamento"
                        : "Uma pessoa"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa" className="text-xs">
                    Todos da empresa
                  </SelectItem>
                  <SelectItem value="department" className="text-xs">
                    Um departamento
                  </SelectItem>
                  <SelectItem value="user" className="text-xs">
                    Uma pessoa
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="rounded-md border bg-slate-50 p-2 text-[11px] text-slate-500">
              Este pipeline fica <span className="font-semibold">só para você</span>. Para um funil
              do time, peça a um administrador.
            </p>
          )}

          {isAdmin && scope === "department" && (
            <div className="space-y-1">
              <Label className="text-xs">Departamento</Label>
              <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue>
                    {departments.find((d) => d.id === departmentId)?.name ?? "Selecionar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {departments.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  Nenhum departamento — crie em Configurações → Departamentos.
                </p>
              )}
            </div>
          )}

          {isAdmin && scope === "user" && (
            <div className="space-y-1">
              <Label className="text-xs">Pessoa</Label>
              <Select value={ownerId} onValueChange={(v) => setOwnerId(v ?? "")}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue>
                    {team.find((u) => u.id === ownerId)?.name ?? "Selecionar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {team.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "edit" && (
            <p className="text-[10px] text-slate-400">
              Esconder um funil esconde junto as fases e os leads dele — inclusive no painel de
              controle e nos relatórios.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || invalid}>
            {saving ? "Salvando..." : mode === "create" ? "Criar pipeline" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
