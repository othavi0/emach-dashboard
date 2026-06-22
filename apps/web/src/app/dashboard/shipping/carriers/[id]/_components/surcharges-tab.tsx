import { formatMoney } from "@/lib/discount-format";
import { formatMeasure } from "@/lib/format/number";
import type { CarrierDetail } from "../../../data";

interface Props {
	detail: CarrierDetail;
}

function fmtPct(v: string | null): string {
	if (v === null) {
		return "—";
	}
	const n = Number(v);
	if (Number.isNaN(n)) {
		return "—";
	}
	return `${formatMeasure(n) ?? String(n)}%`;
}

function fmtMoney(v: string | null): string {
	if (v === null) {
		return "—";
	}
	const n = Number(v);
	if (Number.isNaN(n)) {
		return "—";
	}
	return `R$ ${formatMoney(n)}`;
}

interface RowProps {
	label: string;
	value: string;
}

function Row({ label, value }: RowProps) {
	return (
		<div className="flex items-center justify-between py-3">
			<span className="text-muted-foreground text-sm">{label}</span>
			<span className="font-medium text-sm">{value}</span>
		</div>
	);
}

export function SurchargesTab({ detail }: Props) {
	return (
		<div className="rounded-lg border bg-card p-4">
			<div className="divide-y">
				<Row label="Divisor de cubagem" value={String(detail.cubageDivisor)} />
				<Row label="GRIS (%)" value={fmtPct(detail.grisPercent)} />
				<Row label="GRIS mínimo" value={fmtMoney(detail.grisMinAmount)} />
				<Row label="Ad valorem (%)" value={fmtPct(detail.advaloremPercent)} />
				<Row label="Pedágio" value={fmtMoney(detail.tollAmount)} />
				<Row label="ICMS (%)" value={fmtPct(detail.icmsPercent)} />
			</div>
			{detail.notes ? (
				<div className="mt-4 border-t pt-4">
					<p className="mb-1 text-muted-foreground text-xs uppercase tracking-wider">
						Observações
					</p>
					<p className="text-sm">{detail.notes}</p>
				</div>
			) : null}
		</div>
	);
}
