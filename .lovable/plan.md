Replace the nested `<ScrollArea>` in `ConversationSummaries.tsx` with a standard `<div className="overflow-y-auto max-h-[400px] pr-2">` to fix internal scrolling conflicts with the parent sidebar ScrollArea.

Technical detail:
- Radix ScrollArea components do not handle nested scrolling reliably. Swapping the inner ScrollArea for a native overflow container lets the Resumos AI section scroll independently without trapping or losing wheel events.