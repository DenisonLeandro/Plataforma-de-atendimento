import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Inbox, User } from "lucide-react";

type FilterType = "all" | "unread" | "waiting" | "queue" | "mine";

interface QuickFilterPillsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  unreadCount?: number;
  waitingCount?: number;
  queueCount?: number;
  myConversationsCount?: number;
  showQueue?: boolean;
}

const QuickFilterPills = ({ 
  activeFilter, 
  onFilterChange,
  unreadCount = 0,
  waitingCount = 0,
  queueCount = 0,
  myConversationsCount = 0,
  showQueue = true,
}: QuickFilterPillsProps) => {
  const filters: { value: FilterType; label: string; count?: number; icon?: any }[] = [
    { value: "all", label: "Todas" },
    { value: "mine", label: "Minhas", count: myConversationsCount, icon: User },
    { value: "unread", label: "Não lidas", count: unreadCount },
    { value: "waiting", label: "Aguardando", count: waitingCount, icon: Clock },
    ...(showQueue ? [{ value: "queue" as FilterType, label: "Na Fila", count: queueCount, icon: Inbox }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {filters.map((filter) => {
        const isActive = activeFilter === filter.value;
        const Icon = filter.icon;

        return (
          <Button
            key={filter.value}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onFilterChange(filter.value)}
            className={`
              h-6 px-1.5 text-[10px] leading-none font-medium rounded-full transition-colors whitespace-nowrap flex-shrink-0 gap-1
              ${
                isActive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-sidebar-accent text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent/80"
              }
            `}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {filter.label}
            {filter.count !== undefined && filter.count > 0 && (
              <Badge
                variant={isActive ? "secondary" : "default"}
                className="ml-0.5 h-3.5 px-1 text-[10px] leading-none"
              >
                {filter.count}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
};

export default QuickFilterPills;
