import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";

import type { OrderDetail } from "../../../data";
import { AsaasBlock } from "../asaas-block";

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<p className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
			{children}
		</p>
	);
}

function EdgeDivider() {
	return <div className="-mx-4 border-border border-t" />;
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-[11px] text-muted-foreground">{label}</span>
			<span className="text-sm">{children}</span>
		</div>
	);
}

function formatDims(
	l: number | null,
	w: number | null,
	h: number | null
): string {
	if (l === null && w === null && h === null) {
		return "—";
	}
	return `${l ?? "?"}×${w ?? "?"}×${h ?? "?"}`;
}

export function PaymentFiscalTab({ order }: { order: OrderDetail }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Pagamento & Fiscal</CardTitle>
				<CardDescription>
					Financeiro e documentos — somente leitura no admin.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{/* Pagamento */}
				<SectionHeading>Pagamento</SectionHeading>
				<div className="flex flex-col gap-3">
					<Row label="Método">{order.paymentMethod ?? "—"}</Row>
					<Row label="Ref. gateway">
						<span className="font-mono">{order.paymentProviderRef ?? "—"}</span>
					</Row>
				</div>

				<AsaasBlock
					nfeNumber={order.nfeNumber}
					nfeStatus={order.nfeStatus}
					nfeUrl={order.nfeUrl}
					nfeXmlUrl={order.nfeXmlUrl}
					paymentReceiptUrl={order.paymentReceiptUrl}
				/>

				<EdgeDivider />

				{/* Fiscal por item */}
				<SectionHeading>Fiscal por item</SectionHeading>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Item</TableHead>
							<TableHead>NCM</TableHead>
							<TableHead>CEST</TableHead>
							<TableHead className="text-right">Peso</TableHead>
							<TableHead className="text-right">Dim. (cm)</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{order.items.map((item) => (
							<TableRow key={item.id}>
								<TableCell className="font-medium">{item.name}</TableCell>
								<TableCell className="font-mono text-xs">
									{item.ncm ?? "—"}
								</TableCell>
								<TableCell className="font-mono text-xs">
									{item.cest ?? "—"}
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									{item.weightKg === null ? "—" : `${item.weightKg} kg`}
								</TableCell>
								<TableCell className="text-right font-mono text-xs">
									{formatDims(item.lengthCm, item.widthCm, item.heightCm)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
