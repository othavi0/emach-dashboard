import { ToolCard, type ToolCardData } from "./tool-card";

interface ToolCardGridProps {
	tools: ToolCardData[];
}

export function ToolCardGrid({ tools }: ToolCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{tools.map((tool) => (
				<ToolCard key={tool.id} tool={tool} />
			))}
		</div>
	);
}
