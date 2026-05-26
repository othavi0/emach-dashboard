interface PlaceholderTabProps {
	description?: string;
	title?: string;
}

export function PlaceholderTab({
	title = "Em breve",
	description = "Esta seção será habilitada numa próxima entrega.",
}: PlaceholderTabProps) {
	return (
		<div className="flex flex-col items-center gap-2 py-16 text-center">
			<p className="font-medium text-sm">{title}</p>
			<p className="text-muted-foreground text-xs">{description}</p>
		</div>
	);
}
