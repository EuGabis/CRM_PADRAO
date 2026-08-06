"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ContactField } from "@/lib/data/repos/db/contacts-module";

/** Inputs dinâmicos para os campos personalizados ativos. */
export function CustomFieldsInputs({
  fields,
  values,
  onChange,
}: {
  fields: ContactField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  const active = fields.filter((f) => f.active);
  if (active.length === 0) return null;

  return (
    <>
      {active.map((f) => (
        <div key={f.id} className="space-y-1">
          <Label className="text-xs">{f.name}</Label>
          {f.type === "dropdown" ? (
            <Select
              value={values[f.name] ?? ""}
              onValueChange={(v) => onChange(f.name, v ?? "")}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue>{values[f.name] || "Selecionar"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {f.options.map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
              value={values[f.name] ?? ""}
              onChange={(e) => onChange(f.name, e.target.value)}
              className="h-8"
            />
          )}
        </div>
      ))}
    </>
  );
}
