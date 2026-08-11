"use client";

import { ChannelsTable } from "@/components/whatsapp/channels-table";
import { CreateChannelDialog } from "@/components/whatsapp/create-channel-dialog";

export default function WhatsappPage() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Canais de atendimento</h1>
          <p className="text-xs text-slate-500">
            Números do WhatsApp Business conectados via Meta Cloud API.
          </p>
        </div>
        <CreateChannelDialog />
      </div>
      <ChannelsTable />
    </div>
  );
}
