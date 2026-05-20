import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { CalendarPlus, CheckCircle2, Circle, FolderTree } from "lucide-react";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { ToolDescription } from "@/components/tool-description";
import type { SupplierDetail, SupplierDetailKpis } from "../../data";

function formatCnpj(c: string): string {
	if (c.length !== 14) {
		return c;
	}
	return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

interface Props {
	detail: SupplierDetail;
	kpis: SupplierDetailKpis;
}

export function OverviewTab({ detail, kpis }: Props) {
	const lastAddedLabel = kpis.lastToolAddedAt
		? DATE_FORMAT.format(kpis.lastToolAddedAt)
		: "—";

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow
				items={[
					{
						label: "Ativas",
						value: kpis.activeTools,
						icon: CheckCircle2,
						tone: kpis.activeTools > 0 ? "success" : "default",
					},
					{
						label: "Inativas",
						value: kpis.inactiveTools,
						icon: Circle,
					},
					{
						label: "Última adição",
						value: lastAddedLabel,
						icon: CalendarPlus,
					},
					{
						label: "Categorias cobertas",
						value: kpis.categoriesCovered,
						icon: FolderTree,
					},
				]}
			/>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Sobre</CardTitle>
				</CardHeader>
				<CardContent>
					{detail.notes ? (
						<ToolDescription markdown={detail.notes} />
					) : (
						<div className="flex flex-col items-center gap-2 py-6 text-center">
							<p className="text-muted-foreground text-sm">
								Sem observações cadastradas.
							</p>
						</div>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Contato</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								E-mail
							</dt>
							<dd className="mt-1 text-sm">
								{detail.contactEmail ? (
									<a
										className="underline-offset-4 hover:underline"
										href={`mailto:${detail.contactEmail}`}
									>
										{detail.contactEmail}
									</a>
								) : (
									"—"
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Telefone
							</dt>
							<dd className="mt-1 text-sm">{detail.phone ?? "—"}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Website
							</dt>
							<dd className="mt-1 text-sm">
								{detail.website ? (
									<a
										className="underline-offset-4 hover:underline"
										href={detail.website}
										rel="noopener noreferrer"
										target="_blank"
									>
										{detail.website}
									</a>
								) : (
									"—"
								)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								CNPJ
							</dt>
							<dd className="mt-1 font-medium text-sm tabular-nums">
								{detail.cnpj ? formatCnpj(detail.cnpj) : "—"}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>
		</div>
	);
}
