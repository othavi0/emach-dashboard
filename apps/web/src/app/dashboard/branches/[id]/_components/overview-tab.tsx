import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Building2, MapPin, Package, ShoppingCart, Users } from "lucide-react";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import {
	formatBranchAddress,
	formatBusinessPeriod,
	formatCep,
} from "@/lib/format/branch";
import { formatPhone } from "@/lib/format/phone";
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

function mapsHref(detail: BranchDetail): string | null {
	const addr = formatBranchAddress(detail);
	if (!addr) {
		return null;
	}
	const query = encodeURIComponent(
		`${addr} ${formatCep(detail.cep) ?? ""}`.trim()
	);
	return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

interface Props {
	detail: BranchDetail;
	kpis: BranchDetailKpis;
}

export function OverviewTab({ detail, kpis }: Props) {
	const phone = formatPhone(detail.phone);
	const address = formatBranchAddress(detail);
	const cep = formatCep(detail.cep);
	const href = mapsHref(detail);
	const bh = detail.businessHours;

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow
				items={[
					{ label: "Membros da equipe", value: kpis.teamSize, icon: Users },
					{ label: "SKUs em estoque", value: kpis.skuCount, icon: Package },
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

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
				{/* Endereço & contato */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between">
						<CardTitle className="text-sm">Endereço & contato</CardTitle>
						<Badge variant={detail.status === "active" ? "success" : "secondary"}>
							{detail.status === "active" ? "Ativa" : "Inativa"}
						</Badge>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Endereço
							</p>
							{address ? (
								<div className="mt-1 flex flex-col gap-0.5 text-sm">
									<span>{address}</span>
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
									{href && (
										<a
											className="mt-1 inline-flex w-fit items-center gap-1.5 text-primary text-xs hover:underline"
											href={href}
											rel="noopener"
											target="_blank"
										>
											<MapPin aria-hidden className="size-3.5" />
											Abrir no Google Maps
										</a>
									)}
								</div>
							) : (
								<p className="mt-1 text-muted-foreground text-sm italic">
									Endereço não cadastrado
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-4">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Telefone
								</p>
								<p className="mt-1 text-sm">
									{phone || (
										<span className="text-muted-foreground italic">
											Não informado
										</span>
									)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Responsável
								</p>
								<p className="mt-1 text-sm">
									{detail.responsibleName ?? (
										<span className="text-muted-foreground italic">
											Não definido
										</span>
									)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Operação */}
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Operação</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Horário de funcionamento
							</p>
							{bh ? (
								<dl className="mt-1 flex flex-col gap-1 text-sm">
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Seg – Sex</dt>
										<dd className="tabular-nums">
											{formatBusinessPeriod(bh.weekdays)}
										</dd>
									</div>
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Sábado</dt>
										<dd className="tabular-nums">
											{formatBusinessPeriod(bh.saturday)}
										</dd>
									</div>
									<div className="flex justify-between">
										<dt className="text-muted-foreground">Feriados</dt>
										<dd className="tabular-nums">
											{formatBusinessPeriod(bh.holidays)}
										</dd>
									</div>
								</dl>
							) : (
								<p className="mt-1 text-muted-foreground text-sm italic">
									Não configurado
								</p>
							)}
						</div>
						<div>
							<p className="text-muted-foreground text-xs uppercase tracking-wide">
								Faixas de CEP atendidas
							</p>
							{detail.cepRanges && detail.cepRanges.length > 0 ? (
								<div className="mt-1 flex flex-col gap-0.5 text-sm">
									{detail.cepRanges.map((range) => (
										<span key={`${range.from}-${range.to}`}>
											{range.label ? `${range.label}: ` : ""}
											{formatCep(range.from)} a {formatCep(range.to)}
										</span>
									))}
								</div>
							) : (
								<p className="mt-1 text-muted-foreground text-sm italic">
									Nenhuma faixa cadastrada
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-4 border-border border-t pt-4">
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Criada em
								</p>
								<p className="mt-1 text-sm tabular-nums">
									{formatDate(detail.createdAt)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs uppercase tracking-wide">
									Atualizada em
								</p>
								<p className="mt-1 text-sm tabular-nums">
									{formatDate(detail.updatedAt)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
