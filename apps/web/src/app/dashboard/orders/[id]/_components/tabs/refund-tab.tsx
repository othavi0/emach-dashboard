import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import type { OrderRefundItem } from "../../../data";
import { formatCurrency } from "../../_lib/format-address";

interface RefundTabProps {
	refunds: OrderRefundItem[];
}

const shortDate = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

export function RefundTab({ refunds }: RefundTabProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Reembolso</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{refunds.map((refund) => (
					<div
						className="space-y-3 rounded-md border border-destructive/30 bg-surface-deep p-4"
						key={refund.id}
					>
						<div className="flex items-start justify-between gap-2">
							<p className="font-medium text-sm">{refund.reasonCategory}</p>
							<Badge variant="secondary">{refund.status}</Badge>
						</div>

						<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground text-xs">
							<span>Valor</span>
							<span className="font-medium text-foreground">
								{formatCurrency.format(refund.amount)}
							</span>
							<span>Solicitado em</span>
							<span className="text-foreground">
								{shortDate.format(refund.requestedAt)}
							</span>
							{refund.resolvedAt && (
								<>
									<span>Resolvido em</span>
									<span className="text-foreground">
										{shortDate.format(refund.resolvedAt)}
									</span>
								</>
							)}
							<span>Ref. Asaas</span>
							<span className="font-mono text-foreground">
								{refund.asaasRefundRef ?? "—"}
							</span>
						</div>

						{refund.reasonText && (
							<blockquote className="border-muted border-l-2 pl-3 text-muted-foreground text-xs italic">
								{refund.reasonText}
							</blockquote>
						)}

						{refund.rejectionReason && (
							<div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive text-xs">
								<span className="font-medium">Motivo da recusa: </span>
								{refund.rejectionReason}
							</div>
						)}
					</div>
				))}
			</CardContent>
		</Card>
	);
}
