import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

interface ToolDescriptionProps {
	markdown: string | null | undefined;
}

export function ToolDescription({ markdown }: ToolDescriptionProps) {
	if (!markdown?.trim()) {
		return <p className="text-muted-foreground text-sm">Sem descrição.</p>;
	}
	return (
		<div className="prose prose-sm max-w-none text-foreground">
			<ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
		</div>
	);
}
