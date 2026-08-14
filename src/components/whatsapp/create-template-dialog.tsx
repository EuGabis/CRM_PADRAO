"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { whatsappActions } from "@/lib/data/repos/db/whatsapp";
import { parseVariables, validateTemplateInput, type TemplateCategory } from "@/lib/whatsapp/templates";

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidade",
  AUTHENTICATION: "Autenticação",
};

export function CreateTemplateDialog({
  channelId,
  onCreated,
}: {
  channelId: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("MARKETING");
  const [language, setLanguage] = useState("pt_BR");
  const [bodyText, setBodyText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);

  const vars = useMemo(() => parseVariables(bodyText), [bodyText]);
  // mantém o array de exemplos do tamanho do nº de variáveis
  const exampleValues = vars.map((_, i) => examples[i] ?? "");

  const insertVar = () => {
    const next = vars.length + 1;
    setBodyText((b) => `${b}{{${next}}}`);
  };

  const submit = async () => {
    const input = { name: name.trim(), category, language: language.trim(), bodyText, examples: exampleValues };
    const check = validateTemplateInput(input);
    if (!check.ok) {
      toast.error(check.error);
      return;
    }
    setSaving(true);
    const res = await whatsappActions.createTemplate(channelId, input);
    setSaving(false);
    if (res.ok) {
      toast.success("Template enviado para revisão da Meta");
      setOpen(false);
      setName(""); setCategory("MARKETING"); setLanguage("pt_BR"); setBodyText(""); setExamples([]);
      onCreated();
    } else {
      toast.error(res.error ?? "Não foi possível criar o template");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="h-8 text-xs" />}>
        Criar template
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">Nome (minúsculas, _ no lugar de espaço)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="ex.: confirmacao_pedido" className="h-8 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Categoria</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v as TemplateCategory)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue>{CATEGORY_LABELS[category]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as TemplateCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Idioma</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)}
                placeholder="pt_BR" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Corpo</Label>
              <button type="button" onClick={insertVar}
                className="text-[11px] font-medium text-indigo-600 hover:underline">
                + inserir variável
              </button>
            </div>
            <textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)}
              rows={4} placeholder="Oi {{1}}, seu pedido {{2}} foi confirmado."
              className="rounded-md border px-2 py-1.5 text-xs" />
          </div>
          {vars.length > 0 && (
            <div className="grid gap-2">
              <Label className="text-xs">Exemplos das variáveis</Label>
              {vars.map((n, i) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="w-10 text-[11px] text-slate-500">{`{{${n}}}`}</span>
                  <Input value={exampleValues[i]} className="h-8 text-xs"
                    placeholder={`Exemplo para {{${n}}}`}
                    onChange={(e) =>
                      setExamples((prev) => {
                        const copy = vars.map((_, j) => prev[j] ?? "");
                        copy[i] = e.target.value;
                        return copy;
                      })
                    } />
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={submit} disabled={saving}>
            {saving ? "Enviando..." : "Criar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
