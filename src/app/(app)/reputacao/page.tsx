"use client";

import { useMemo, useState } from "react";
import { Star, Video } from "lucide-react";
import { toast } from "sonner";
import { SubNav } from "@/components/layout/subnav";
import { KpiCard } from "@/components/shared/kpi-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { contactName, useContacts } from "@/lib/data/repos/contacts";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Integrações" },
  { label: "Visão geral" },
  { label: "Solicitações" },
  { label: "Avaliações" },
  { label: "Depoimentos em vídeo" },
  { label: "Widgets" },
  { label: "Listagens" },
  { label: "Configurações" },
];

const PLATFORMS = [
  { name: "Google Business Profile", connected: true },
  { name: "Facebook", connected: true },
  { name: "Booking.com", connected: false },
  { name: "Airbnb", connected: false },
  { name: "Amazon", connected: false },
  { name: "Capterra", connected: false },
  { name: "Glassdoor", connected: false },
  { name: "App Store", connected: false },
  { name: "Google Play", connected: false },
  { name: "Expedia", connected: false },
  { name: "iFood", connected: false },
  { name: "Reclame Aqui", connected: false },
];

const STAR_DISTRIBUTION = [
  { stars: 5, count: 96 },
  { stars: 4, count: 21 },
  { stars: 3, count: 6 },
  { stars: 2, count: 2 },
  { stars: 1, count: 3 },
];

const REQUEST_META = [
  { channel: "WhatsApp", sentAt: "05/08/2026 14:20", status: "Respondida" },
  { channel: "E-mail", sentAt: "05/08/2026 09:10", status: "Pendente" },
  { channel: "SMS", sentAt: "04/08/2026 16:45", status: "Respondida" },
  { channel: "WhatsApp", sentAt: "04/08/2026 11:30", status: "Pendente" },
  { channel: "WhatsApp", sentAt: "03/08/2026 15:05", status: "Respondida" },
  { channel: "E-mail", sentAt: "02/08/2026 10:00", status: "Pendente" },
];

const REVIEWS = [
  {
    author: "Maurício Sampaio",
    stars: 5,
    platform: "Google",
    text: "Plataforma completa. Centralizamos WhatsApp, Instagram e e-mail em um só lugar e o time dobrou a velocidade de resposta.",
    date: "04/08/2026",
  },
  {
    author: "Eduarda Nunes",
    stars: 5,
    platform: "Google",
    text: "O agente de IA responde os leads de madrugada e já chega tudo qualificado pela manhã. Recomendo demais.",
    date: "01/08/2026",
  },
  {
    author: "Thiago Almeida",
    stars: 4,
    platform: "Facebook",
    text: "Ótimo custo-benefício. As automações economizam horas por semana. Só sinto falta de mais relatórios prontos.",
    date: "28/07/2026",
  },
  {
    author: "Mariana Prado",
    stars: 5,
    platform: "Google",
    text: "Suporte excelente e onboarding rápido. Em uma semana o funil inteiro já estava rodando no CRM.",
    date: "22/07/2026",
  },
];

const TESTIMONIALS = [
  { name: "Hugo Ferraz", duration: "1:24" },
  { name: "Quésia Moura", duration: "0:58" },
  { name: "Camila Duarte", duration: "2:07" },
];

const LISTINGS = [
  { platform: "Google Business Profile", status: "Sincronizada", lastSync: "06/08/2026 08:00" },
  { platform: "Facebook", status: "Sincronizada", lastSync: "06/08/2026 08:00" },
  { platform: "Bing Places", status: "Pendente", lastSync: "—" },
  { platform: "Apple Maps", status: "Pendente", lastSync: "—" },
];

function Stars({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "size-3.5",
            i < count ? "fill-amber-400 text-amber-400" : "text-slate-200"
          )}
        />
      ))}
    </span>
  );
}

export default function ReputacaoPage() {
  const [tab, setTab] = useState("Integrações");
  const contacts = useContacts();
  const requestRows = useMemo(
    () =>
      REQUEST_META.map((meta, i) => ({
        ...meta,
        contact: contacts[i] ? contactName(contacts[i]) : "—",
      })),
    [contacts]
  );
  const [autoReply, setAutoReply] = useState(true);
  const [spamFilter, setSpamFilter] = useState(true);
  const [minRating, setMinRating] = useState("4 estrelas");
  const maxStarCount = Math.max(...STAR_DISTRIBUTION.map((s) => s.count));

  return (
    <div>
      <SubNav tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {tab === "Integrações" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Integrações de reputação</h1>
            <p className="mb-4 text-xs text-slate-500">
              Conecte plataformas de avaliação para importar e responder reviews da sua empresa.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLATFORMS.map((p) => (
                <div key={p.name} className="flex flex-col rounded-xl border bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-sm font-black text-slate-600">
                      {p.name[0]}
                    </span>
                    <Badge
                      variant="secondary"
                      className={p.connected ? "bg-emerald-100 text-emerald-700" : ""}
                    >
                      {p.connected ? "Conexão ativa" : "Não conectado"}
                    </Badge>
                  </div>
                  <p className="mt-2 flex-1 text-sm font-semibold text-slate-800">{p.name}</p>
                  <Button
                    variant={p.connected ? "outline" : "default"}
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => toast.info(`Integração com ${p.name} chega com o backend`)}
                  >
                    {p.connected ? "Gerenciar" : "Conectar conta"}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "Visão geral" && (
          <>
            <h1 className="mb-4 text-lg font-bold text-slate-900">Visão geral da reputação</h1>
            <div className="mb-5 grid gap-3 md:grid-cols-4">
              <KpiCard label="Nota média" value="4,8" delta={2.1} />
              <KpiCard label="Avaliações no mês" value="32" delta={18.5} />
              <KpiCard label="Taxa de resposta" value="96%" delta={4.0} />
              <KpiCard label="Solicitações enviadas" value="118" delta={11.3} />
            </div>
            <div className="max-w-xl rounded-xl border bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Avaliações por estrela</h2>
              <div className="space-y-2">
                {STAR_DISTRIBUTION.map((s) => (
                  <div key={s.stars} className="flex items-center gap-3">
                    <span className="flex w-8 items-center gap-1 text-xs font-medium text-slate-600">
                      {s.stars} <Star className="size-3 fill-amber-400 text-amber-400" />
                    </span>
                    <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-2.5 rounded-full bg-amber-400"
                        style={{ width: `${(s.count / maxStarCount) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-xs text-slate-500">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === "Solicitações" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Solicitações de avaliação</h1>
                <p className="text-xs text-slate-500">
                  Convites enviados aos seus contatos para avaliarem sua empresa.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => toast.info("Solicitação de avaliação chega com o backend")}
              >
                Solicitar avaliação
              </Button>
            </div>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Contato</th>
                    <th className="px-4 py-2.5 font-medium">Canal</th>
                    <th className="px-4 py-2.5 font-medium">Enviada em</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {requestRows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.contact}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.channel}</td>
                      <td className="px-4 py-2.5 text-slate-500">{r.sentAt}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="secondary"
                          className={cn(r.status === "Respondida" && "bg-emerald-100 text-emerald-700")}
                        >
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "Avaliações" && (
          <>
            <h1 className="mb-4 text-lg font-bold text-slate-900">Avaliações recebidas</h1>
            <div className="grid gap-3 lg:grid-cols-2">
              {REVIEWS.map((r) => (
                <div key={r.author} className="rounded-xl border bg-white p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{r.author}</p>
                    <Badge variant="secondary">{r.platform}</Badge>
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Stars count={r.stars} />
                    <span className="text-[11px] text-slate-400">{r.date}</span>
                  </div>
                  <p className="text-xs text-slate-600">{r.text}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => toast.info("Resposta com IA chega com o backend")}
                  >
                    Responder com IA
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "Depoimentos em vídeo" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-900">Depoimentos em vídeo</h1>
                <p className="text-xs text-slate-500">
                  Colete depoimentos gravados dos seus clientes para usar em páginas e anúncios.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => toast.info("Solicitação de depoimento chega com o backend")}
              >
                Solicitar depoimento
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <div key={t.name} className="rounded-xl border bg-white p-3">
                  <div className="flex h-32 items-center justify-center rounded-lg bg-slate-100">
                    <span className="flex size-11 items-center justify-center rounded-full bg-white text-indigo-500 shadow-sm">
                      <Video className="size-5" />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                    <span className="text-[11px] text-slate-400">{t.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "Widgets" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Widgets de avaliação</h1>
            <p className="mb-4 text-xs text-slate-500">
              Exiba suas avaliações no seu site com widgets prontos para incorporar.
            </p>
            <div className="grid gap-3 lg:max-w-3xl lg:grid-cols-2">
              <div className="flex flex-col rounded-xl border bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">Carrossel de avaliações</p>
                <p className="mt-1 text-xs text-slate-500">
                  Mostra as melhores avaliações em rotação automática.
                </p>
                <div className="mt-3 flex-1 rounded-lg bg-slate-50 p-3">
                  <Stars count={5} />
                  <p className="mt-1 text-[11px] text-slate-600">
                    &ldquo;Plataforma completa, o time dobrou a velocidade de resposta.&rdquo;
                  </p>
                  <p className="mt-1 text-[10px] text-slate-400">Maurício S. — Google</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs"
                  onClick={() => toast.info("Código de incorporação chega com o backend")}
                >
                  Copiar código
                </Button>
              </div>
              <div className="flex flex-col rounded-xl border bg-white p-4">
                <p className="text-sm font-semibold text-slate-800">Selo de nota</p>
                <p className="mt-1 text-xs text-slate-500">
                  Selo compacto com a nota média para o rodapé do site.
                </p>
                <div className="mt-3 flex flex-1 items-center justify-center rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center gap-2 rounded-full border bg-white px-4 py-2 shadow-sm">
                    <Star className="size-4 fill-amber-400 text-amber-400" />
                    <span className="text-sm font-bold text-slate-800">4,8</span>
                    <span className="text-[10px] text-slate-400">128 avaliações</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs"
                  onClick={() => toast.info("Código de incorporação chega com o backend")}
                >
                  Copiar código
                </Button>
              </div>
            </div>
          </>
        )}

        {tab === "Listagens" && (
          <>
            <h1 className="mb-1 text-lg font-bold text-slate-900">Listagens em diretórios</h1>
            <p className="mb-4 text-xs text-slate-500">
              Mantenha os dados da sua empresa sincronizados nos principais diretórios.
            </p>
            <div className="rounded-xl border bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b text-[11px] text-slate-400">
                    <th className="px-4 py-2.5 font-medium">Plataforma</th>
                    <th className="px-4 py-2.5 font-medium">Status da listagem</th>
                    <th className="px-4 py-2.5 font-medium">Última sincronização</th>
                  </tr>
                </thead>
                <tbody>
                  {LISTINGS.map((l) => (
                    <tr key={l.platform} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{l.platform}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="secondary"
                          className={cn(l.status === "Sincronizada" && "bg-emerald-100 text-emerald-700")}
                        >
                          {l.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{l.lastSync}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "Configurações" && (
          <>
            <h1 className="mb-4 text-lg font-bold text-slate-900">Configurações de reputação</h1>
            <div className="max-w-xl space-y-3 rounded-xl border bg-white p-5">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-xs font-medium text-slate-700">Resposta automática com IA</p>
                  <p className="text-[11px] text-slate-400">
                    A IA responde novas avaliações no tom da sua marca.
                  </p>
                </div>
                <Switch checked={autoReply} onCheckedChange={setAutoReply} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-xs font-medium text-slate-700">Filtro de spam</p>
                  <p className="text-[11px] text-slate-400">
                    Oculta avaliações suspeitas ou duplicadas automaticamente.
                  </p>
                </div>
                <Switch checked={spamFilter} onCheckedChange={setSpamFilter} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nota mínima para pedir review público</Label>
                <Select value={minRating} onValueChange={(v) => v && setMinRating(v)}>
                  <SelectTrigger className="h-8 w-full text-xs">
                    <SelectValue>{minRating}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {["3 estrelas", "4 estrelas", "5 estrelas"].map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => toast.success("Configurações salvas (sessão)")}
              >
                Salvar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
