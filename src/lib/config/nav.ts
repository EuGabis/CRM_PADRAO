import {
  Rocket,
  LayoutDashboard,
  MessageSquare,
  CalendarDays,
  Users,
  KanbanSquare,
  CreditCard,
  Sparkles,
  Bot,
  Megaphone,
  Workflow,
  Globe,
  GraduationCap,
  HardDrive,
  Star,
  BarChart3,
  Puzzle,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/ativacao", label: "Checklist de Ativação", icon: Rocket },
  { href: "/dashboard", label: "Painel de controle", icon: LayoutDashboard },
  { href: "/conversas", label: "Conversas", icon: MessageSquare },
  { href: "/calendarios", label: "Calendários", icon: CalendarDays },
  { href: "/contatos", label: "Contatos", icon: Users },
  { href: "/leads", label: "Leads", icon: KanbanSquare },
  { href: "/pagamentos", label: "Pagamentos", icon: CreditCard },
  { href: "/ai-studio", label: "AI Studio", icon: Sparkles, badge: "Beta" },
  { href: "/agentes-ia", label: "Agentes de IA", icon: Bot },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/automacoes", label: "Automações", icon: Workflow },
  { href: "/sites", label: "Sites", icon: Globe },
  { href: "/assinaturas", label: "Assinaturas", icon: GraduationCap },
  { href: "/midia", label: "Mídia Drive", icon: HardDrive },
  { href: "/reputacao", label: "Reputação", icon: Star },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/marketplace", label: "Marketplace", icon: Puzzle },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/configuracoes",
  label: "Configurações",
  icon: Settings,
};
