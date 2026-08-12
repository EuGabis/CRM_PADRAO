"use client";

import { FieldsTab } from "@/components/contacts/module-tabs";

/**
 * Campos personalizados são reais (tabela `contact_fields`, migração 0002) e
 * já tinham UI completa em Contatos → Campos personalizados. Esta página só
 * reaproveita o mesmo componente — antes ela mostrava uma tabela fixa de
 * exemplo, que não tinha relação com os campos realmente cadastrados.
 */
export default function CamposPage() {
  return <FieldsTab />;
}
