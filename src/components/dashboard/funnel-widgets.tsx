"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { WidgetCard } from "./widget-card";
import { formatBRL } from "@/lib/data/repos/opportunities";
import { useDbPipeline } from "@/lib/data/repos/db/pipeline";
import { useDashboardOps } from "./date-range";
import { TOOLTIP_STYLE } from "./opportunity-widgets";

export function FunnelWidget() {
  const [pipeId, setPipeId] = useState("");
  const pipeline = useDbPipeline(pipeId);
  const ops = useDashboardOps();
  if (!pipeline) return null;

  const rows = pipeline.stages.map((st) => {
    const stageOps = ops.filter((o) => o.pipelineId === pipeline.id && o.stageId === st.id);
    return { stage: st, count: stageOps.length, value: stageOps.reduce((s, o) => s + o.value, 0) };
  });
  const max = Math.max(1, ...rows.map((r) => r.count));
  const first = rows[0]?.count || 1;

  return (
    <WidgetCard title="Funil" pipelineId={pipeId} onPipelineChange={setPipeId}>
      <div className="space-y-1">
        <div className="flex justify-end gap-6 pr-1 text-[10px] font-semibold text-slate-400">
          <span className="w-16 text-right">Cumulativo</span>
          <span className="w-20 text-right">Próx. etapa conv.</span>
        </div>
        {rows.map((r, i) => {
          const cumulative = first ? (r.count / first) * 100 : 0;
          const prev = i === 0 ? r.count : rows[i - 1].count;
          const nextConv = prev ? (r.count / prev) * 100 : 0;
          return (
            <div key={r.stage.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div
                  className="flex h-9 min-w-[120px] flex-col justify-center rounded px-2"
                  style={{ width: `${Math.max(18, (r.count / max) * 100)}%`, background: r.stage.color }}
                >
                  <span className="truncate text-[10px] font-bold leading-tight text-white">
                    {r.stage.name}
                  </span>
                  <span className="text-[9px] leading-tight text-white/90">{formatBRL(r.value)}</span>
                </div>
              </div>
              <span className="w-16 text-right text-[11px] font-medium text-slate-600">
                {cumulative.toFixed(1)}%
              </span>
              <span className="w-20 text-right text-[11px] font-medium text-slate-600">
                {(i === 0 ? 100 : nextConv).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </WidgetCard>
  );
}

export function StageDistribution() {
  const [pipeId, setPipeId] = useState("");
  const pipeline = useDbPipeline(pipeId);
  const ops = useDashboardOps();
  if (!pipeline) return null;

  const data = pipeline.stages
    .map((st) => {
      const stageOps = ops.filter((o) => o.pipelineId === pipeline.id && o.stageId === st.id);
      return {
        name: st.name,
        value: stageOps.length,
        money: stageOps.reduce((s, o) => s + o.value, 0),
        color: st.color,
      };
    })
    .filter((d) => d.value > 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <WidgetCard title="Distribuição de fases" pipelineId={pipeId} onPipelineChange={setPipeId}>
      <div className="flex items-center gap-4">
        <div className="relative h-[190px] w-[190px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {/* rootTabIndex -1: o <Pie> nasce focável e o anel de foco do SVG vira um quadrado. */}
              <Pie data={data} dataKey="value" innerRadius={58} outerRadius={85} strokeWidth={0} rootTabIndex={-1}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-bold text-slate-900">{total.toLocaleString("pt-BR")}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1 text-[11px]">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-sm" style={{ background: d.color }} />
              <span className="truncate text-slate-600">
                {d.name} · {formatBRL(d.money)} ({((d.value / total) * 100).toFixed(1)}%) · {d.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </WidgetCard>
  );
}
