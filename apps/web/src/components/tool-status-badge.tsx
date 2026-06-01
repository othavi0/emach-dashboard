import { Badge } from "@emach/ui/components/badge";

type ToolStatus = "active" | "draft" | "discontinued";

const LABEL: Record<ToolStatus, string> = {
	active: "Ativa",
	draft: "Rascunho",
	discontinued: "Descontinuada",
};

const VARIANT: Record<ToolStatus, "success" | "secondary" | "outline"> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
};

export function ToolStatusBadge({ status }: { status: ToolStatus }) {
	return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
