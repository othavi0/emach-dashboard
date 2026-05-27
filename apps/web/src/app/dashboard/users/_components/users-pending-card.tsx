import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { PendingRow } from "@/components/pending-panel";

import { BulkPendingSelection } from "./bulk-pending-selection";

interface Props {
	count: number;
	initial: PendingRow[];
	initialCursor: string | null;
}

export function UsersPendingCard({ initial, count }: Props) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle className="text-base">Aprovações</CardTitle>
				<Badge variant={count > 0 ? "warning" : "default"}>{count}</Badge>
			</CardHeader>
			<CardContent>
				<BulkPendingSelection initial={initial} />
			</CardContent>
		</Card>
	);
}
