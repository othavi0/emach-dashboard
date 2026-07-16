import { Card, CardContent } from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";

import { getInitials } from "@/lib/format/name";
import {
	type ExceptionTone,
	exceptionTone,
	formatExceptionRate,
	formatSessionDuration,
} from "../_lib/productivity";
import type {
	PickingOperatorProductivity,
	PickingProductivitySummary,
} from "../data";

const TONE_CLASS: Record<ExceptionTone, string> = {
	muted: "text-muted-foreground",
	success: "text-success",
	warning: "text-warning",
};

function formatCount(n: number): string {
	return n.toLocaleString("pt-BR");
}

function formatUnits(n: number): string {
	const label = n === 1 ? "unidade separada" : "unidades separadas";
	return `${formatCount(n)} ${label}`;
}

// Mesmo markup do KpiCard do dashboard home, sem NumberTicker: o valor aqui
// pode ser string formatada (duração), que o ticker não representa.
function StatCard({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-1 p-4">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</p>
				<p className="font-semibold text-2xl tabular-nums">{value}</p>
				{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
			</CardContent>
		</Card>
	);
}

export function ProductivityPanel({
	summary,
	operators,
}: {
	summary: PickingProductivitySummary;
	operators: PickingOperatorProductivity[];
}) {
	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<StatCard
					label="Concluídas hoje"
					sub={formatUnits(summary.unitsToday)}
					value={formatCount(summary.completedToday)}
				/>
				<StatCard
					label="Concluídas · 7 dias"
					sub={formatUnits(summary.unitsWeek)}
					value={formatCount(summary.completedWeek)}
				/>
				<StatCard
					label="Tempo médio de sessão"
					sub="últimos 7 dias"
					value={formatSessionDuration(summary.avgSessionSeconds)}
				/>
			</div>

			<section>
				<h2 className="mb-2.5 font-medium text-sm">
					Por operador{" "}
					<span className="font-normal text-muted-foreground text-xs">
						· últimos 7 dias
					</span>
				</h2>
				{operators.length === 0 ? (
					<p className="py-10 text-center text-muted-foreground text-sm">
						Nenhuma separação concluída nos últimos 7 dias.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Operador</TableHead>
								<TableHead className="text-right">Hoje</TableHead>
								<TableHead className="text-right">7 dias</TableHead>
								<TableHead className="text-right">Tempo médio</TableHead>
								<TableHead className="text-right">Un. separadas</TableHead>
								<TableHead className="text-right">Exceções</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{operators.map((op) => (
								<TableRow key={op.operatorKey}>
									<TableCell>
										<span className="flex items-center gap-2">
											<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-[10px]">
												{getInitials(op.pickerName)}
											</span>
											<span className="font-medium">{op.pickerName}</span>
										</span>
									</TableCell>
									<TableCell className="text-right">
										{formatCount(op.completedToday)}
									</TableCell>
									<TableCell className="text-right">
										{formatCount(op.completedWeek)}
									</TableCell>
									<TableCell className="text-right">
										{formatSessionDuration(op.avgSessionSeconds)}
									</TableCell>
									<TableCell className="text-right">
										{formatCount(op.unitsWeek)}
									</TableCell>
									<TableCell
										className={cn(
											"text-right",
											TONE_CLASS[
												exceptionTone(op.exceptionCount, op.completedWeek)
											]
										)}
									>
										{formatExceptionRate(op.exceptionCount, op.completedWeek)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
		</div>
	);
}
