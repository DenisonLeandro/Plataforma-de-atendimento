import { Badge } from '@/components/ui/badge';
import { Clock, UserCheck } from 'lucide-react';

interface QueueIndicatorProps {
  assignedTo?: string | null;
  assignedToName?: string;
  size?: 'sm' | 'default';
}

export function QueueIndicator({ assignedTo, assignedToName }: QueueIndicatorProps) {
  if (!assignedTo) {
    return (
      <Badge variant="warning">
        <Clock />
        Na Fila
      </Badge>
    );
  }
  return (
    <Badge variant="neutral">
      <UserCheck />
      {assignedToName ? assignedToName.split(' ')[0] : 'Atribuído'}
    </Badge>
  );
}
