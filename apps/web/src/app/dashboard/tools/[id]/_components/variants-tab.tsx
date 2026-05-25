import { Badge } from "@emach/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";

import type { ToolDetailVariant } from "../_lib/tool-detail-data";

interface VariantsTabProps {
	variants: ToolDetailVariant[];
}

const PRICE_FORMATTER = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatPrice(value: string | null): string {
	if (value === null) {
		return "—";
	}
	return PRICE_FORMATTER.format(Number(value));
}

export function VariantsTab({ variants }: VariantsTabProps) {
	if (variants.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhuma variante cadastrada.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>SKU</TableHead>
					<TableHead>Voltagem</TableHead>
					<TableHead className="text-right">Preço</TableHead>
					<TableHead className="text-right">Custo</TableHead>
					<TableHead className="text-center">Padrão</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{variants.map((v) => (
					<TableRow key={v.id}>
						<TableCell className="font-mono text-xs">{v.sku}</TableCell>
						<TableCell>{v.voltage}</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatPrice(v.priceAmount)}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatPrice(v.costAmount)}
						</TableCell>
						<TableCell className="text-center">
							{v.isDefault && <Badge variant="success">●</Badge>}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
