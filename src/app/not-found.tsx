import Link from "next/link";
import { brand } from "@/lib/config/brand";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 text-center">
      <p className="text-6xl font-black text-indigo-500">404</p>
      <h1 className="text-xl font-bold text-slate-900">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Essa página não existe no {brand.name}. Verifique o endereço ou volte para o painel.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
      >
        Voltar ao painel
      </Link>
    </div>
  );
}
