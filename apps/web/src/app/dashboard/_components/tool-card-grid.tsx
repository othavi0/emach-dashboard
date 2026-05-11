import { ToolCard, type ToolCardData, type ToolCardVariant } from "./tool-card";

interface ToolCardGridProps {
	canMutate: boolean;
	renderActions?: (tool: ToolCardData) => React.ReactNode;
	tools: ToolCardData[];
	variant: ToolCardVariant;
}

export function ToolCardGrid({
	tools,
	variant,
	canMutate,
	renderActions,
}: ToolCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{tools.map((tool) => (
				<ToolCard
					actions={renderActions?.(tool)}
					canMutate={canMutate}
					key={tool.id}
					tool={tool}
					variant={variant}
				/>
			))}
		</div>
	);
}
