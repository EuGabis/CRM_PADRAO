"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useUsers } from "@/lib/data/repos/contacts";

const PERMISSION_GROUPS = [
  { name: "Conversas", perms: ["Ver conversas", "Responder conversas", "Excluir conversas"] },
  { name: "Contatos", perms: ["Ver contatos", "Criar e editar", "Exportar", "Excluir"] },
  { name: "Leads & Pipelines", perms: ["Ver pipelines", "Mover oportunidades", "Editar pipelines"] },
  { name: "Automações", perms: ["Ver fluxos", "Criar e editar fluxos", "Publicar fluxos"] },
  { name: "Agentes de IA", perms: ["Ver agentes", "Editar prompts", "Ver painel de IA"] },
  { name: "Pagamentos", perms: ["Ver pagamentos", "Criar cobranças", "Gerenciar integrações"] },
  { name: "Relatórios", perms: ["Ver relatórios", "Criar relatórios", "Agendar envios"] },
  { name: "Configurações", perms: ["Ver configurações", "Gerenciar equipe", "Gerenciar conta"] },
];

export default function EquipePage() {
  const users = useUsers();
  const [editing, setEditing] = useState<string | null>(null);
  const [role, setRole] = useState("admin");
  const [groupsOn, setGroupsOn] = useState<Record<string, boolean>>(
    Object.fromEntries(PERMISSION_GROUPS.map((g) => [g.name, true]))
  );

  const editingUser = users.find((u) => u.id === editing);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Minha equipe</h1>
          <p className="text-xs text-slate-500">
            Usuários ilimitados, sem custo por assento.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Convite de usuários chega com o backend")}>
          <Plus className="size-3.5" /> Adicionar usuário
        </Button>
      </div>

      <div className="rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              <th className="px-4 py-2.5 font-medium">Nome</th>
              <th className="px-4 py-2.5 font-medium">E-mail</th>
              <th className="px-4 py-2.5 font-medium">Tipo</th>
              <th className="px-4 py-2.5 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2 font-medium text-slate-800">
                    <Avatar className="size-6">
                      <AvatarFallback
                        className="text-[9px] font-bold text-white"
                        style={{ background: u.color }}
                      >
                        {u.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    {u.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5">
                  <Badge
                    variant="secondary"
                    className={u.role === "admin" ? "bg-indigo-100 text-indigo-700" : ""}
                  >
                    {u.role === "admin" ? "ACCOUNT-ADMIN" : "ACCOUNT-USER"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setEditing(u.id);
                        setRole(u.role);
                      }}
                      className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      onClick={() => toast.info("Remoção de usuários chega com o backend")}
                      className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <div className="mt-5 rounded-xl border bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">
              Funções & Permissões — {editingUser.name}
            </h2>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => toast.info("Cópia de permissões chega em breve")}
            >
              Copiar permissões
            </Button>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-6">
            <div className="space-y-1">
              <Label className="text-xs">Função do usuário</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v)}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue>{role === "admin" ? "Administrador" : "Usuário"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" className="text-xs">
                    Administrador
                  </SelectItem>
                  <SelectItem value="user" className="text-xs">
                    Usuário
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Label className="flex items-center gap-2 text-xs font-normal text-slate-600">
              <Checkbox /> Limitar visibilidade apenas a dados atribuídos
            </Label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {PERMISSION_GROUPS.map((g) => (
              <div key={g.name} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-bold text-slate-700">{g.name}</p>
                  <Switch
                    checked={groupsOn[g.name]}
                    onCheckedChange={(v) => setGroupsOn((s) => ({ ...s, [g.name]: !!v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  {g.perms.map((p) => (
                    <Label
                      key={p}
                      className={`flex items-center gap-2 text-[11px] font-normal ${
                        groupsOn[g.name] ? "text-slate-600" : "text-slate-300"
                      }`}
                    >
                      <Checkbox defaultChecked disabled={!groupsOn[g.name]} /> {p}
                    </Label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            className="mt-4 text-xs"
            onClick={() => {
              toast.success("Permissões salvas (sessão)");
              setEditing(null);
            }}
          >
            Salvar permissões
          </Button>
        </div>
      )}
    </div>
  );
}
