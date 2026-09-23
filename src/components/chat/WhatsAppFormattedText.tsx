import { Fragment } from "react";
import { cn } from "@/lib/utils";

interface WhatsAppFormattedTextProps {
  text: string | null;
  className?: string;
}

const boldPattern = /\*([^*\n]+)\*/g;

export const WhatsAppFormattedText = ({ text, className }: WhatsAppFormattedTextProps) => {
  const content = text ?? "";
  const parts: Array<{ text: string; bold: boolean }> = [];
  let lastIndex = 0;

  for (const match of content.matchAll(boldPattern)) {
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      parts.push({ text: content.slice(lastIndex, matchIndex), bold: false });
    }

    parts.push({ text: match[1], bold: true });
    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({ text: content.slice(lastIndex), bold: false });
  }

  return (
    <p className={cn("whitespace-pre-wrap", className)}>
      {parts.length > 0
        ? parts.map((part, index) => (
            <Fragment key={`${index}-${part.text}`}>
              {part.bold ? <strong className="font-bold">{part.text}</strong> : part.text}
            </Fragment>
          ))
        : content}
    </p>
  );
};