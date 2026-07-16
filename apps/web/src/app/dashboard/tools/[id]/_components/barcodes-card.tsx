import { Badge } from "@emach/ui/components/badge";
import { BarcodeEan13 } from "@/components/barcode-ean13";
import { CopyButton } from "@/components/copy-button";
import type { ToolDetailVariant } from "../_lib/tool-detail-data";
import { SectionCard } from "./section-card";

export function BarcodesCard({ variants }: { variants: ToolDetailVariant[] }) {
	return (
		<SectionCard title="Códigos de barras">
			<ul className="flex flex-col">
				{variants.map((v, index) => (
					<li
						className={
							index > 0 ? "mt-3 border-border/60 border-t pt-3" : undefined
						}
						key={v.id}
					>
						<div className="mb-1 flex items-center justify-between gap-2">
							{v.voltage ? (
								<Badge variant="secondary">{v.voltage}</Badge>
							) : (
								<span aria-hidden />
							)}
							<span className="font-mono text-[10px] text-muted-foreground">
								{v.sku}
							</span>
						</div>
						<BarcodeEan13 code={v.barcode} height={36} />
						<div className="mt-1 flex items-center justify-between gap-2">
							<span className="font-mono text-xs">{v.barcode}</span>
							<CopyButton
								label={`código de barras ${v.barcode}`}
								value={v.barcode}
							/>
						</div>
					</li>
				))}
			</ul>
		</SectionCard>
	);
}
