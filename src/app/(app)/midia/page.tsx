"use client";

import {
  FileSpreadsheet,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Palette,
  Upload,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FILES = [
  { name: "Depoimento Donizetti v4.mp4", type: "video" },
  { name: "Depoimento Donizetti v2.mp4", type: "video" },
  { name: "Criativo Lucas — formato vertical.mp4", type: "video" },
  { name: "banner-promo-agosto.png", type: "image" },
  { name: "logo-lito-fundo-escuro.png", type: "image" },
  { name: "mockup-dashboard.png", type: "image" },
  { name: "Export_Contacts_Julho.csv", type: "csv" },
  { name: "planilha-metas-q3.csv", type: "csv" },
];

const ICON = { video: Video, image: ImageIcon, csv: FileSpreadsheet } as const;

export default function MidiaPage() {
  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Armazenamento de mídia</h1>
          <p className="text-xs text-slate-500">
            Atalho para Canva e Google Drive sem sair do CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            <HardDrive className="size-3" /> 14,09 GB usados
          </Badge>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Integração com Canva chega com o backend")}>
            <Palette className="size-3.5" /> Conectar Canva
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Criação de pastas chega em breve")}>
            <FolderPlus className="size-3.5" /> Nova pasta
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.info("Upload de arquivos chega com o backend")}>
            <Upload className="size-3.5" /> Carregar
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FILES.map((f) => {
          const Icon = ICON[f.type as keyof typeof ICON];
          return (
            <div key={f.name} className="rounded-xl border bg-white p-3 hover:border-indigo-300">
              <div className="flex h-24 items-center justify-center rounded-lg bg-slate-100">
                <Icon className="size-8 text-slate-400" />
              </div>
              <p className="mt-2 truncate text-xs font-medium text-slate-700">{f.name}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
