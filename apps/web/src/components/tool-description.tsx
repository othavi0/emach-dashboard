import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";

interface ToolDescriptionProps {
	markdown: string | null | undefined;
}

export function ToolDescription({ markdown }: ToolDescriptionProps) {
	if (!markdown?.trim()) {
		return <p className="text-muted-foreground text-sm">Sem descrição.</p>;
	}
	return (
		// headings: só blobs legados com # — o editor novo não produz heading
		<div className="max-w-none text-foreground text-sm leading-relaxed [&_:is(h1,h2,h3,h4)]:mt-3 [&_:is(h1,h2,h3,h4)]:font-semibold [&_:is(h1,h2,h3,h4)]:first:mt-0 [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_p]:first:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
			<ReactMarkdown
				rehypePlugins={[rehypeSanitize]}
				remarkPlugins={[remarkBreaks]}
			>
				{markdown}
			</ReactMarkdown>
		</div>
	);
}
