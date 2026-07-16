import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { HelpTooltip } from "@/components/help-tooltip";
import { FISCAL_HELP, MODEL_HELP } from "../../_components/fields/spec-help";
import type { AttributeGroup } from "../_lib/attribute-grouping";
import type { FixedSpecKey, SpecDivergences } from "../_lib/spec-divergence";
import {
	fiscalCandidates,
	isAttributeFilled,
	partitionRows,
	physicalCandidates,
} from "../_lib/spec-rows";
import type { ToolDetailRow } from "../_lib/tool-detail-data";
import { AttributeValue } from "./attribute-value";

interface ToolSpecsProps {
	attributeGroups: AttributeGroup[];
	divergences: SpecDivergences;
	tool: ToolDetailRow;
}

/** `SpecCandidate.key` é `string`; estreita pra `FixedSpecKey` antes de consultar `divergences.fixed` (Set tipado). */
function isFixedSpecKey(key: string): key is FixedSpecKey {
	return key === "weightKg" || key === "powerWatts";
}

/** HelpTooltip por key de campo fixo (mantém as ajudas contextuais atuais). */
function fieldHelp(key: string): ReactNode {
	switch (key) {
		case "model":
			return <HelpTooltip label="Sobre Modelo" text={MODEL_HELP.model} />;
		case "invoiceModel":
			return (
				<HelpTooltip label="Sobre Modelo NF" text={MODEL_HELP.invoiceModel} />
			);
		case "hsCode":
			return <HelpTooltip label="Sobre HS Code" {...FISCAL_HELP.hsCode} />;
		case "ncm":
			return <HelpTooltip label="Sobre NCM" {...FISCAL_HELP.ncm} />;
		case "cest":
			return <HelpTooltip label="Sobre CEST" {...FISCAL_HELP.cest} />;
		default:
			return null;
	}
}

export function ToolSpecs({
	tool,
	attributeGroups,
	divergences,
}: ToolSpecsProps) {
	const fisicas = partitionRows(physicalCandidates(tool));
	const fiscal = partitionRows(fiscalCandidates(tool));

	const attributeSections = attributeGroups.map((group) => {
		const filled = group.attributes.filter(isAttributeFilled);
		return {
			group,
			filled,
			emptyLabels: group.attributes
				.filter((a) => !isAttributeFilled(a))
				.map((a) => a.label),
		};
	});

	const emptyLabels = [
		...fisicas.emptyLabels,
		...attributeSections.flatMap((s) => s.emptyLabels),
		...fiscal.emptyLabels,
	];

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-5">
				{fisicas.rows.length > 0 && (
					<SpecSection
						filled={fisicas.rows.length}
						title="Físicas"
						total={fisicas.total}
					>
						{fisicas.rows.map((row) => (
							<LeaderRow
								diverges={
									isFixedSpecKey(row.key) && divergences.fixed.has(row.key)
								}
								help={fieldHelp(row.key)}
								key={row.key}
								label={row.label}
								mono={row.mono}
							>
								{row.value}
							</LeaderRow>
						))}
					</SpecSection>
				)}

				{attributeSections.map(
					({ group, filled }) =>
						filled.length > 0 && (
							<SpecSection
								filled={filled.length}
								key={group.categoryId}
								title={`Técnicas · ${group.categoryName}`}
								total={group.attributes.length}
							>
								{filled.map((a) => (
									<LeaderRow
										diverges={divergences.attributeSlugs.has(a.slug)}
										key={a.slug}
										label={a.label}
									>
										<AttributeValue attr={a} />
									</LeaderRow>
								))}
							</SpecSection>
						)
				)}

				{fiscal.rows.length > 0 && (
					<SpecSection
						filled={fiscal.rows.length}
						title="Classificação fiscal"
						total={fiscal.total}
					>
						{fiscal.rows.map((row) => (
							<LeaderRow
								help={fieldHelp(row.key)}
								key={row.key}
								label={row.label}
								mono={row.mono}
							>
								{row.value}
							</LeaderRow>
						))}
					</SpecSection>
				)}

				{emptyLabels.length > 0 && (
					<p className="border-border/60 border-t pt-2.5 text-muted-foreground text-xs">
						{emptyLabels.length === 1
							? "1 campo sem valor"
							: `${emptyLabels.length} campos sem valor`}
						: {emptyLabels.join(", ")}
					</p>
				)}
			</div>
		</TooltipProvider>
	);
}

function SpecSection({
	title,
	filled,
	total,
	children,
}: {
	children: ReactNode;
	filled: number;
	title: string;
	total: number;
}) {
	return (
		<section>
			<h3 className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
				{title}
				<span className="ml-1.5 font-normal text-[10px] text-muted-foreground/70 normal-case tracking-normal">
					{filled} de {total}
				</span>
			</h3>
			<dl className="grid gap-x-8 md:grid-cols-2">{children}</dl>
		</section>
	);
}

function LeaderRow({
	label,
	children,
	mono,
	help,
	diverges,
}: {
	children: ReactNode;
	diverges?: boolean;
	help?: ReactNode;
	label: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-baseline gap-2 py-1">
			<dt className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs">
				{label}
				{help}
				{diverges && <DivergenceMark />}
			</dt>
			<span
				aria-hidden
				className="min-w-4 flex-1 self-center border-border border-b border-dotted"
			/>
			<dd
				className={
					mono
						? "text-right font-mono text-xs"
						: "text-right font-medium text-sm"
				}
			>
				{children}
			</dd>
		</div>
	);
}

function DivergenceMark() {
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label="Valor diverge entre cadastro e ficha técnica"
				render={<span className="inline-flex text-warning" />}
			>
				<TriangleAlert aria-hidden className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent>
				Valor diverge entre o cadastro (coluna fixa) e a ficha técnica
				(atributo).
			</TooltipContent>
		</Tooltip>
	);
}
