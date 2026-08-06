"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WidgetCard } from "./widget-card";
import { formatBRL, useOpportunities } from "@/lib/data/repos/opportunities";

function useFilteredOps(pipelineId: string) {
  const ops = useOpportunities();
  return pipelineId === "all" ? ops : ops.filter((o) => o.pipelineId === pipelineId);
}

const STATUS_LABEL: Record<string, string> = {
  open: "Aberto(a)",
  won: "Ganho(a)",
  lost: "Perdido(a)",
};
const STATUS_COLOR: Record<string, string> = {
  open: "#6366f1",
  won: "#22c55e",
  lost: "#ef4444",
};

export function StatusDonut() {
  const [pipe, setPipe] = useState("pipe-controle");
  const ops = useFilteredOps(pipe);
  const data = (["open", "won", "lost"] as const)
    .map((s) => ({ name: STATUS_LABEL[s], value: ops.filter((o) => o.status === s).length, color: STATUS_COLOR[s] }))
    .filter((d) => d.value > 0);
  const total = ops.length;
  return (
    <WidgetCard title="Status da Oportunidade" pipelineId={pipe} onPipelineChange={setPipe}>
      <div className="flex items-center gap-4">
        <div className="relative h-[150px] w-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={48} outerRadius={68} strokeWidth={0}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => [`${v}`, ""]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-slate-900">
              {total >= 1000 ? `${(total / 1000).toFixed(2)}K` : total}
            </span>
          </div>
        </div>
        <ul className="space-y-1.5 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: d.color }} />
              <span className="text-slate-600">
                {d.name} · {d.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
}

export function ValueBars() {
  const [pipe, setPipe] = useState("pipe-controle");
  const ops = useFilteredOps(pipe);
  const data = (["open", "won", "lost"] as const).map((s) => ({
    name: STATUS_LABEL[s],
    valor: ops.filter((o) => o.status === s).reduce((sum, o) => sum + o.value, 0),
    fill: STATUS_COLOR[s],
  }));
  const total = data.reduce((s, d) => s + d.valor, 0);
  return (
    <WidgetCard
      title="Valor de Oportunidade"
      pipelineId={pipe}
      onPipelineChange={setPipe}
      footer={
        <p className="mt-2 border-t pt-2 text-center text-xs text-slate-500">
          Receita total <span className="font-bold text-slate-800">{formatBRL(total)}</span>
        </p>
      }
    >
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20 }}>
          <XAxis type="number" tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}K`} fontSize={10} />
          <YAxis type="category" dataKey="name" width={70} fontSize={10} />
          <Tooltip formatter={(v) => formatBRL(Number(v))} />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </WidgetCard>
  );
}

export function ConversionGauge() {
  const [pipe, setPipe] = useState("pipe-controle");
  const ops = useFilteredOps(pipe);
  const won = ops.filter((o) => o.status === "won");
  const rate = ops.length ? Math.round((won.length / ops.length) * 100) : 0;
  const revenue = won.reduce((s, o) => s + o.value, 0);
  const data = [{ name: "conv", value: rate, fill: "#6366f1" }];
  return (
    <WidgetCard
      title="Taxa de conversão"
      pipelineId={pipe}
      onPipelineChange={setPipe}
      footer={
        <p className="mt-2 border-t pt-2 text-center text-xs text-slate-500">
          Receita ganha <span className="font-bold text-slate-800">{formatBRL(revenue)}</span>
        </p>
      }
    >
      <div className="relative h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="70%"
            outerRadius="95%"
            data={data}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "#eef2ff" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{rate}%</span>
        </div>
      </div>
    </WidgetCard>
  );
}
