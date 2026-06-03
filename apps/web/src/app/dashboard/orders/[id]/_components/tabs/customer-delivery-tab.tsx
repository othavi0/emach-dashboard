import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import Link from "next/link";

import type { OrderDetail } from "../../../data";
import {
	formatAddress,
	formatCurrency,
	formatDocument,
} from "../../_lib/format-address";

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

export function CustomerDeliveryTab({ order }: { order: OrderDetail }) {
	const addressLines = formatAddress(order.shippingAddress);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Cliente / Entrega</CardTitle>
				<CardDescription>
					Dados do cliente e endereço congelado no checkout.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{/* Cliente */}
				<SectionHeading>Cliente</SectionHeading>
				<div className="flex flex-col gap-3">
					<Row label="Nome">{order.clientName}</Row>
					<Row label="E-mail">{order.clientEmail}</Row>
					<Row label="Telefone">{order.clientPhone ?? "—"}</Row>
					<Row label="CPF / CNPJ">
						<span className="font-mono">
							{formatDocument(order.clientDocument)}
						</span>
					</Row>
					<Link
						className="text-primary text-sm hover:underline"
						href={`/dashboard/customers/${order.clientId}`}
					>
						Ver cliente ↗
					</Link>
				</div>

				<EdgeDivider />

				{/* Endereço de entrega */}
				<SectionHeading>Endereço de entrega</SectionHeading>
				<div className="flex flex-col gap-1 text-sm">
					{addressLines.length > 0 ? (
						addressLines.map((line) => <p key={line}>{line}</p>)
					) : (
						<p className="text-muted-foreground">—</p>
					)}
					<p className="mt-1 text-muted-foreground">
						Método:{" "}
						<span className="text-foreground">
							{order.shippingMethod ?? "—"}
						</span>{" "}
						· {formatCurrency.format(order.shippingAmount)}
					</p>
					<p className="text-muted-foreground">
						Rastreio:{" "}
						<span className="font-mono text-foreground">
							{order.shippingTrackingCode ?? "—"}
						</span>
					</p>
				</div>

				<EdgeDivider />

				{/* Observação do cliente */}
				<SectionHeading>Observação do cliente</SectionHeading>
				{order.customerNotes ? (
					<div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
						{order.customerNotes}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">—</p>
				)}
			</CardContent>
		</Card>
	);
}
