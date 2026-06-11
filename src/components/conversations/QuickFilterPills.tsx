import { Clock, Inbox, User } from "lucide-react";

type FilterType = "all" | "unread" | "waiting" | "queue" | "mine";

interface QuickFilterPillsProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  unreadCount?: number;
  waitingCount?: number;
  queueCount?: number;
  myConversationsCount?: number;
}

const QuickFilterPills = ({ 
  activeFilter, 
  onFilterChange,
  unreadCount = 0,
  waitingCount = 0,
  queueCount = 0,
  myConversationsCount = 0
}: QuickFilterPillsProps) => {
  const filters: { value: FilterType; label: string; count?: number; icon?: any }[] = [
    { value: "all", label: "Todas" },
    { value: "unread", label: "Não lidas", count: unreadCount },
    { value: "waiting", label: "Aguardando", count: waitingCount, icon: Clock },
    { value: "queue", label: "Na Fila", count: queueCount, icon: Inbox },
    { value: "mine", label: "Minhas", count: myConversationsCount, icon: User },
  ];

  return (
    <div className="flex gap-1.5 overflow-x-auto flex-nowrap pb-1.5 scrollbar-hide">
      {filters.map((filter) => {
        const isActive = activeFilter === filter.value;

        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onFilterChange(filter.value)}
            className={`
              inline-flex items-center gap-1.5 h-[30px] px-3 text-[12.5px] font-medium rounded-pill
              whitespace-nowrap flex-shrink-0 border
              ${isActive
                ? "bg-brand text-text-on-dark border-brand"
                : "bg-transparent text-text-secondary border-subtle hover:bg-bg-surface-2 hover:text-text-primary"}
            `}
          >
            {filter.label}
            {filter.count !== undefined && filter.count > 0 && (
              <span
                className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-semibold tabular
                  ${isActive ? "bg-white/15 text-text-on-dark" : "bg-accent text-white"}`}
              >
                {filter.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default QuickFilterPills;
