import { Badge } from '@/components/ui/badge';
import { Tag } from 'lucide-react';
import { CONVERSATION_TOPICS } from '@/constants/conversationTopics';

interface TopicBadgesProps {
  topics?: string[];
  size?: 'sm' | 'default';
  showIcon?: boolean;
  maxTopics?: number;
}

const getTopicLabel = (topic: string): string => {
  return CONVERSATION_TOPICS[topic as keyof typeof CONVERSATION_TOPICS] 
    || topic.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

export function TopicBadges({ 
  topics, 
  size = 'default',
  showIcon = false,
  maxTopics = 3
}: TopicBadgesProps) {
  if (!topics || topics.length === 0) return null;

  const displayTopics = topics.slice(0, maxTopics);
  const remaining = topics.length - maxTopics;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {showIcon && (
        <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
      )}
      {displayTopics.map((topic, index) => (
        <Badge key={index} variant="info">
          {getTopicLabel(topic)}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="neutral">+{remaining}</Badge>
      )}
    </div>
  );
}
