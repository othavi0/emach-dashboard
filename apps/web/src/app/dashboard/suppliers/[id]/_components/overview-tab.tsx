import { toDate } from "@emach/db/utils";
import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { CalendarPlus, CheckCircle2, Circle, FolderTree } from "lucide-react";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { ToolDescription } from "@/components/tool-description";
import { formatDate } from "@/lib/format/datetime";
import type { SupplierDetail, SupplierDetailKpis } from "../../data";

function formatCnpj(c: string): string {
	if (c.length !== 14) {
		return c;
	}
	return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12, 14)}`;
}

interface Props {
	detail: SupplierDetail;
	kpis: SupplierDetailKpis;
}

export function OverviewTab({ detail, kpis }: Props) {
	const lastAddedAt = toDate(kpis.lastToolAddedAt);
	const lastAddedLabel = lastAddedAt ? formatDate(lastAddedAt) : "—";

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
						label: "Última entrada",
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

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Contato */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="text-sm">Contato</CardTitle>
						<Badge
							variant={detail.status === "active" ? "success" : "secondary"}
						>
							{detail.status === "active" ? "Ativo" : "Arquivado"}
						</Badge>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
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
						<div className="-mx-4 -mb-4 grid grid-cols-2 border-border border-t">
							<div className="flex flex-col items-center border-border border-r py-2.5">
								<span className="font-bold text-[14px] text-foreground tabular-nums">
									{formatDate(detail.createdAt)}
								</span>
								<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
									Criado em
								</span>
							</div>
							<div className="flex flex-col items-center py-2.5">
								<span className="font-bold text-[14px] text-foreground tabular-nums">
									{formatDate(detail.updatedAt)}
								</span>
								<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
									Atualizado em
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Sobre */}
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
			</div>
		</div>
	);
}
