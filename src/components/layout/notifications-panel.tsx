"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Bell, CalendarClock, MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createClient } from "@/lib/supabase/client";
import { useApptStore } from "@/lib/data/repos/db/appointments";
import { useDbStore } from "@/lib/data/repos/db/contacts";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Central de notificações do sino. Antes o botão só emitia um toast dizendo
 * que "chega em breve".
 *
 * **Não existe tabela de notificações.** Os avisos são DERIVADOS do que já
 * está no banco — conversa não lida, compromisso próximo, agendamento que
 * falhou. Uma tabela exigiria alguém escrevendo nela em todo lugar (webhook,
 * motor de automações, cron do marketing) e qualquer caminho esquecido viraria
 * um aviso que nunca chega. Derivar não tem como ficar dessincronizado.
 *
 * **Consultas próprias e enxutas**, não os stores dos módulos: o store de
 * Conversas carrega TODAS as mensagens da empresa, e o sino vive no shell —
 * pagar isso em toda tela pelo contador seria absurdo. Aqui são duas consultas
 * com `limit`, e só as colunas usadas.
 *
 * **"Lido" é um carimbo de tempo no `localStorage`** (não no banco): estado de
 * tela, por dispositivo, no mesmo espírito do lembrete de compromisso.
 */

const SEEN_KEY = "lito.notifications.seen-at";
const REFRESH_MS = 60_000;
const UPCOMING_HOURS = 24;

type NotificationKind = "conversa" | "compromisso" | "agendamento";

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  /** Momento que ordena e define "novo". ISO. */
  at: string;
  href: string;
}

const ICON: Record<NotificationKind, typeof Bell> = {
  conversa: MessageSquare,
  compromisso: CalendarClock,
  agendamento: AlertTriangle,
};

const ICON_CLASS: Record<NotificationKind, string> = {
  conversa: "bg-indigo-50 text-indigo-600",
  compromisso: "bg-emerald-50 text-emerald-600",
  agendamento: "bg-rose-50 text-rose-600",
};

function readSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SEEN_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const locationId = useDbStore((s) => s.locationId);

  const refresh = useCallback(async () => {
    await useDbStore.getState().load();
    const loc = useDbStore.getState().locationId;
    if (!loc) return;
    const supabase = createClient();
    const now = Date.now();

    // 1) Conversas não lidas (abertas). A RLS já limita ao que a pessoa vê,
    // inclusive a segmentação por número da 0035.
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, contact_id, unread_count, last_message_at, last_message_preview")
      .eq("location_id", loc)
      .gt("unread_count", 0)
      .is("closed_at", null)
      .is("archived_at", null)
      .order("last_message_at", { ascending: false })
      .limit(15);

    // Nomes só dos contatos que apareceram — carregar a agenda inteira de
    // contatos aqui seria pior que o problema.
    const contactIds = [...new Set((convs ?? []).map((c: any) => c.contact_id).filter(Boolean))];
    const nameById = new Map<string, string>();
    if (contactIds.length > 0) {
      const { data: people } = await supabase
        .from("contacts")
        .select("id, first_name, last_name")
        .in("id", contactIds);
      for (const p of people ?? []) {
        nameById.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Contato");
      }
    }

    // 2) Mensagens agendadas que falharam — o motor grava o motivo e ninguém
    // ficava sabendo sem abrir a aba Agendadas.
    const { data: failed } = await supabase
      .from("messages")
      .select("id, conversation_id, body, schedule_error, scheduled_for")
      .eq("location_id", loc)
      .eq("schedule_status", "falhou")
      .order("scheduled_for", { ascending: false })
      .limit(10);

    // 3) Compromissos das próximas 24h (a store já está carregada pelo
    // lembrete, que vive no mesmo shell).
    const appointments = useApptStore.getState().appointments.filter((a) => {
      const start = new Date(a.start).getTime();
      return start >= now && start <= now + UPCOMING_HOURS * 3_600_000;
    });

    const next: NotificationItem[] = [
      ...(convs ?? []).map((c: any) => ({
        id: `conv-${c.id}`,
        kind: "conversa" as const,
        title: `${nameById.get(c.contact_id) ?? "Contato"} — ${c.unread_count} não lida${
          c.unread_count > 1 ? "s" : ""
        }`,
        description: c.last_message_preview ?? "Nova mensagem",
        at: c.last_message_at ?? new Date(now).toISOString(),
        href: `/conversas?c=${c.id}`,
      })),
      ...(failed ?? []).map((m: any) => ({
        id: `sched-${m.id}`,
        kind: "agendamento" as const,
        title: "Mensagem agendada falhou",
        description: m.schedule_error || m.body || "Sem detalhes",
        at: m.scheduled_for ?? new Date(now).toISOString(),
        href: `/conversas?c=${m.conversation_id}`,
      })),
      ...appointments.map((a) => ({
        id: `appt-${a.id}`,
        kind: "compromisso" as const,
        title: a.title,
        description: `Começa ${format(new Date(a.start), "EEEE 'às' HH:mm", { locale: ptBR })}`,
        // Ordena pelo início: um compromisso "novo" é o que está mais perto.
        at: a.start,
        href: "/calendarios",
      })),
    ].sort((x, y) => y.at.localeCompare(x.at));

    setItems(next);
  }, []);

  useEffect(() => {
    let alive = true;
    // `seenAt` sai do localStorage aqui dentro (e não num inicializador de
    // estado) porque o servidor não tem localStorage: ler no render daria
    // 0 no HTML e o valor real na hidratação, com o contador piscando.
    const run = async () => {
      await refresh();
      if (alive) setSeenAt(readSeenAt());
    };
    void run();
    const timer = setInterval(() => void run(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [refresh, locationId]);

  // "Novo" = ACONTECEU depois da última vez que o sino foi aberto. Compromisso
  // fica de fora da conta: o `at` dele é no futuro, então seria eternamente
  // "mais novo" que qualquer visita e o contador nunca zeraria. Ele aparece na
  // lista como contexto — quem avisa da reunião é o lembrete da 0042.
  const unseen = items.filter(
    (i) => i.kind !== "compromisso" && new Date(i.at).getTime() > seenAt
  ).length;

  const markSeen = () => {
    const now = Date.now();
    try {
      window.localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      // localStorage bloqueado — o contador volta no F5, nada quebra.
    }
    setSeenAt(now);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          void refresh();
          markSeen();
        }
      }}
    >
      <PopoverTrigger
        render={
          <button
            title="Notificações"
            className="relative flex size-7 items-center justify-center rounded-full text-slate-300 hover:bg-slate-700"
          />
        }
      >
        <Bell className="size-4" />
        {unseen > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-orange-400 px-1 text-[9px] font-bold text-slate-900">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs font-bold text-slate-700">Notificações</p>
          <span className="text-[10px] text-slate-400">{items.length} itens</span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-8 text-center text-[11px] leading-relaxed text-slate-400">
              Nada por aqui. Aparecem avisos de conversas não lidas, compromissos das próximas
              24 horas e mensagens agendadas que falharam.
            </p>
          )}
          {items.map((item) => {
            const Icon = ICON[item.kind];
            const isNew = item.kind !== "compromisso" && new Date(item.at).getTime() > seenAt;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-start gap-2.5 border-b px-3 py-2.5 last:border-0 hover:bg-slate-50",
                  isNew && "bg-indigo-50/40"
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    ICON_CLASS[item.kind]
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500">
                    {item.description}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {formatDistanceToNow(new Date(item.at), { addSuffix: true, locale: ptBR })}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
