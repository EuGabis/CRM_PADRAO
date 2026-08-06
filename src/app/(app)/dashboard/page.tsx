"use client";

import { DashboardSwitcher } from "@/components/dashboard/dashboard-switcher";
import { DateFilter } from "@/components/dashboard/date-filter";
import {
  ConversionGauge,
  StatusDonut,
  ValueBars,
} from "@/components/dashboard/opportunity-widgets";
import { FunnelWidget, StageDistribution } from "@/components/dashboard/funnel-widgets";
import {
  GaCards,
  LeadSourceTable,
  ManualActionsCard,
} from "@/components/dashboard/report-widgets";

export default function DashboardPage() {
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <DashboardSwitcher />
        <DateFilter />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatusDonut />
        <ValueBars />
        <ConversionGauge />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FunnelWidget />
        <StageDistribution />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <LeadSourceTable />
        <ManualActionsCard />
      </div>
      <div className="mt-4">
        <GaCards />
      </div>
    </div>
  );
}
