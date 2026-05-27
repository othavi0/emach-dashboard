import { MessageSquareQuoteIcon } from "lucide-react";

interface CustomerNoteCardProps {
	notes: string | null;
}

export function CustomerNoteCard({ notes }: CustomerNoteCardProps) {
	if (!notes || notes.trim().length === 0) {
		return null;
	}
	return (
		<div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
			<MessageSquareQuoteIcon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0"
			/>
			<div className="flex flex-col gap-0.5">
				<p className="font-medium text-xs uppercase tracking-wide">
					Observação do cliente
				</p>
				<p className="text-sm leading-relaxed">{notes}</p>
			</div>
		</div>
	);
}
