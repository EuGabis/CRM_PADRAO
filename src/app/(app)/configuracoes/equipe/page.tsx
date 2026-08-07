"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Copy, Loader2, Mail, Plus, ShieldCheck, Trash2, UserCog, X } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { brand } from "@/lib/config/brand";
import { PERMISSION_MODULES } from "@/lib/config/nav";
import {
  teamActions,
  useMyMembership,
  useTeam,
  type MemberRole,
  type ModulePermissions,
  type TeamMember,
} from "@/lib/data/repos/db/team";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "Administrador",
  user: "Usuário",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function EquipePage() {
  const { members, invitations, loaded, loading } = useTeam();
  const { isAdmin, me, loaded: meLoaded } = useMyMembership();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pendingInvites = useMemo(
    () => invitations.filter((i) => i.status === "pending"),
    [invitations]
  );

  const editing = members.find((m) => m.userId === editingId) ?? null;

  if (loading && !loaded) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Carregando equipe...
      </div>
    );
  }

  if (meLoaded && !isAdmin) {
    return (
      <div className="max-w-lg rounded-xl border bg-white p-6">
        <ShieldCheck className="mb-3 size-6 text-slate-400" />
        <h1 className="text-lg font-bold text-slate-900">Acesso restrito</h1>
        <p className="mt-1 text-sm text-slate-500">
          Somente administradores podem gerenciar a equipe. Fale com um administrador da sua
          empresa se precisar de acesso.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Minha equipe</h1>
          <p className="text-xs text-slate-500">
            Usuários ilimitados, sem custo por assento. Convide sua equipe e defina o que cada
            pessoa acessa.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setInviteOpen(true)}>
          <Plus className="size-3.5" /> Convidar usuário
        </Button>
      </div>

      {/* Membros */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b text-[11px] text-slate-400">
              <th className="px-4 py-2.5 font-medium">Nome</th>
              <th className="px-4 py-2.5 font-medium">E-mail</th>
              <th className="px-4 py-2.5 font-medium">Função</th>
              <th className="px-4 py-2.5 font-medium">Visibilidade</th>
              <th className="px-4 py-2.5 font-medium">Módulos</th>
              <th className="px-4 py-2.5 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const blocked = Object.values(m.permissions).filter((v) => v === false).length;
              const isMe = m.userId === me?.userId;
              return (
                <tr key={m.userId} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <Avatar className="size-6">
                        <AvatarFallback
                          className="text-[9px] font-bold text-white"
                          style={{ background: m.color }}
                        >
                          {initials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      {m.name}
                      {isMe && (
                        <span className="text-[10px] font-normal text-slate-400">(você)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{m.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="secondary"
                      className={m.role === "admin" ? "bg-indigo-100 text-indigo-700" : ""}
                    >
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {m.role === "admin"
                      ? "Todos os dados"
                      : m.onlyAssigned
                        ? "Apenas atribuídos a ele"
                        : "Todos os dados"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {m.role === "admin" || blocked === 0 ? (
                      "Todos"
                    ) : (
                      <span className="text-amber-600">{blocked} bloqueado(s)</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingId(m.userId)}
                        title="Editar função e permissões"
                        className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <UserCog className="size-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Remover ${m.name} da equipe? A pessoa perde o acesso a esta empresa.`
                            )
                          )
                            return;
                          const res = await teamActions.removeMember(m.userId);
                          res.ok
                            ? toast.success("Usuário removido da equipe")
                            : toast.error(res.error ?? "Não foi possível remover");
                        }}
                        title="Remover da equipe"
                        className="flex size-6 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Convites pendentes */}
      {pendingInvites.length > 0 && (
        <div className="mt-5 rounded-xl border bg-white">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Mail className="size-3.5 text-slate-400" />
            <p className="text-sm font-semibold text-slate-800">Convites pendentes</p>
            <Badge variant="secondary" className="text-[10px]">
              {pendingInvites.length}
            </Badge>
          </div>
          <table className="w-full text-left text-xs">
            <tbody>
              {pendingInvites.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{i.email}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary">{ROLE_LABEL[i.role]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    Enviado em {format(new Date(i.createdAt), "d MMM yyyy", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}/login`
                          );
                          toast.success("Link de acesso copiado — envie para a pessoa");
                        }}
                        className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:underline"
                      >
                        <Copy className="size-3" /> Copiar link
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Cancelar o convite de ${i.email}?`)) return;
                          (await teamActions.deleteInvite(i.id))
                            ? toast.success("Convite cancelado")
                            : toast.error("Não foi possível cancelar");
                        }}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-red-500"
                      >
                        <X className="size-3" /> Cancelar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-[11px] text-slate-400">
            A pessoa entra automaticamente na sua empresa ao criar a conta com este e-mail.
          </p>
        </div>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      {editing && (
        <PermissionsDialog
          member={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditingId(null)}
        />
      )}
    </div>
  );
}

/* ----------------------------- Convite ----------------------------- */

function PermissionsGrid({
  role,
  permissions,
  onToggle,
}: {
  role: MemberRole;
  permissions: ModulePermissions;
  onToggle: (key: string, allowed: boolean) => void;
}) {
  const disabled = role === "admin";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-xs font-semibold">Módulos visíveis</Label>
        {disabled ? (
          <span className="text-[10px] text-slate-400">
            Administradores acessam todos os módulos
          </span>
        ) : (
          <div className="flex gap-2 text-[10px]">
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => PERMISSION_MODULES.forEach((m) => onToggle(m.key, true))}
            >
              Liberar todos
            </button>
            <button
              className="text-slate-400 hover:underline"
              onClick={() => PERMISSION_MODULES.forEach((m) => onToggle(m.key, false))}
            >
              Bloquear todos
            </button>
          </div>
        )}
      </div>
      <div
        className={cn(
          "grid max-h-56 grid-cols-2 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border p-3",
          disabled && "opacity-50"
        )}
      >
        {PERMISSION_MODULES.map((m) => (
          <Label
            key={m.key}
            className="flex items-center gap-2 text-[11px] font-normal text-slate-600"
          >
            <Checkbox
              checked={disabled ? true : permissions[m.key] !== false}
              disabled={disabled}
              onCheckedChange={(v) => onToggle(m.key, Boolean(v))}
            />
            {m.label}
          </Label>
        ))}
      </div>
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("user");
  const [onlyAssigned, setOnlyAssigned] = useState(false);
  const [permissions, setPermissions] = useState<ModulePermissions>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!email.includes("@")) {
      toast.error("Informe um e-mail válido");
      return;
    }
    setSaving(true);
    const res = await teamActions.invite({ email, role, onlyAssigned, permissions });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível convidar");
      return;
    }
    if (res.warning) {
      toast.warning(res.warning, { duration: 8000 });
    } else {
      toast.success(`Convite enviado por e-mail para ${email.trim().toLowerCase()}`);
    }
    setEmail("");
    setRole("user");
    setOnlyAssigned(false);
    setPermissions({});
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar para a equipe</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">E-mail *</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendedor@empresa.com.br"
              className="h-8"
            />
            <p className="text-[10px] text-slate-400">
              Enviamos um convite com a identidade do {brand.name}. A pessoa cria a conta com
              este e-mail e entra direto na sua empresa.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as MemberRole)}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue>{ROLE_LABEL[role]}</SelectValue>
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
            <div className="space-y-1">
              <Label className="text-xs">Visibilidade de dados</Label>
              <div className="flex h-8 items-center gap-2">
                <Switch
                  checked={onlyAssigned}
                  disabled={role === "admin"}
                  onCheckedChange={(v) => setOnlyAssigned(Boolean(v))}
                />
                <span className="text-[11px] text-slate-500">
                  {role === "admin"
                    ? "Todos os dados"
                    : onlyAssigned
                      ? "Apenas atribuídos"
                      : "Todos os dados"}
                </span>
              </div>
            </div>
          </div>
          <PermissionsGrid
            role={role}
            permissions={permissions}
            onToggle={(key, allowed) =>
              setPermissions((p) => ({ ...p, [key]: allowed }))
            }
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Criando..." : "Criar convite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------- Editar função e permissões -------------------- */

function PermissionsDialog({
  member,
  open,
  onOpenChange,
}: {
  member: TeamMember;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [role, setRole] = useState<MemberRole>(member.role);
  const [onlyAssigned, setOnlyAssigned] = useState(member.onlyAssigned);
  const [permissions, setPermissions] = useState<ModulePermissions>(member.permissions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRole(member.role);
    setOnlyAssigned(member.onlyAssigned);
    setPermissions(member.permissions);
  }, [member]);

  const save = async () => {
    setSaving(true);
    const res = await teamActions.updateMember(member.userId, {
      role,
      onlyAssigned: role === "admin" ? false : onlyAssigned,
      permissions: role === "admin" ? {} : permissions,
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível salvar");
      return;
    }
    toast.success(`Permissões de ${member.name} atualizadas`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Função e permissões — {member.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <Select value={role} onValueChange={(v) => v && setRole(v as MemberRole)}>
                <SelectTrigger className="h-8 w-full text-xs">
                  <SelectValue>{ROLE_LABEL[role]}</SelectValue>
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
            <div className="space-y-1">
              <Label className="text-xs">Ver apenas dados atribuídos</Label>
              <div className="flex h-8 items-center gap-2">
                <Switch
                  checked={role === "admin" ? false : onlyAssigned}
                  disabled={role === "admin"}
                  onCheckedChange={(v) => setOnlyAssigned(Boolean(v))}
                />
                <span className="text-[11px] text-slate-500">
                  {role === "admin"
                    ? "Admin vê tudo"
                    : onlyAssigned
                      ? "Contatos e leads dele"
                      : "Todos os dados"}
                </span>
              </div>
            </div>
          </div>
          <PermissionsGrid
            role={role}
            permissions={permissions}
            onToggle={(key, allowed) => setPermissions((p) => ({ ...p, [key]: allowed }))}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
