import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Building2, Package, ShoppingCart, Users } from "lucide-react";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { formatBranchAddress, formatCep } from "@/lib/format/branch";
import type { BranchDetail, BranchDetailKpis } from "../../data";

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatDate(date: Date): string {
	return new Intl.DateTimeFormat("pt-BR", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
}

interface Props {
	detail: BranchDetail;
	kpis: BranchDetailKpis;
}

export function OverviewTab({ detail, kpis }: Props) {
	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow
				items={[
					{
						label: "Membros da equipe",
						value: kpis.teamSize,
						icon: Users,
					},
					{
						label: "SKUs em estoque",
						value: kpis.skuCount,
						icon: Package,
					},
					{
						label: "Valor em estoque",
						value: BRL.format(kpis.stockValue),
						icon: Building2,
					},
					{
						label: "Pedidos (30 dias)",
						value: kpis.orders30d,
						icon: ShoppingCart,
					},
				]}
			/>

			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Informações da filial</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Nome
							</dt>
							<dd className="mt-1 font-medium text-sm">{detail.name}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wider">
								Endereço
							</dt>
							<dd className="mt-1 text-sm">
								{(() => {
									const line = formatBranchAddress(detail);
									const cep = formatCep(detail.cep);
									if (!(line || cep)) {
										return "—";
									}
									return (
										<div className="flex flex-col gap-0.5">
											{line && <span>{line}</span>}
											{cep && (
												<span className="text-muted-foreground text-xs">
													CEP {cep}
												</span>
											)}
											{detail.complement && (
												<span className="text-muted-foreground text-xs">
													Compl.: {detail.complement}
												</span>
											)}
										</div>
									);
								})()}
							</dd>
						</div>
						{detail.phone ? (
							<div>
								<dt className="text-muted-foreground text-xs uppercase tracking-wide">
									Telefone
								</dt>
								<dd className="mt-1 text-sm">{detail.phone}</dd>
							</div>
						) : null}
						{detail.responsibleName ? (
							<div>
								<dt className="text-muted-foreground text-xs uppercase tracking-wide">
									Responsável
								</dt>
								<dd className="mt-1 text-sm">{detail.responsibleName}</dd>
							</div>
						) : null}
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Criada em
							</dt>
							<dd className="mt-1 text-sm tabular-nums">
								{formatDate(detail.createdAt)}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground text-xs uppercase tracking-wide">
								Atualizada em
							</dt>
							<dd className="mt-1 text-sm tabular-nums">
								{formatDate(detail.updatedAt)}
							</dd>
						</div>
					</dl>
				</CardContent>
			</Card>
		</div>
	);
}
