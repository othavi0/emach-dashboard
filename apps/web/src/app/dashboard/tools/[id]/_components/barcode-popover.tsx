"use client";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { Barcode } from "lucide-react";
import { BarcodeEan13 } from "@/components/barcode-ean13";
import { CopyButton } from "@/components/copy-button";
import { isValidEan13 } from "@/lib/ean13";

interface BarcodePopoverProps {
	barcode: string;
	trigger?: "text" | "icon";
}

export function BarcodePopover({
	barcode,
	trigger = "text",
}: BarcodePopoverProps) {
	return (
		<Popover>
			{trigger === "text" ? (
				<PopoverTrigger
					render={
						<button
							className="cursor-pointer font-mono text-xs underline decoration-border decoration-dotted underline-offset-4 hover:decoration-foreground"
							type="button"
						>
							{barcode}
						</button>
					}
				/>
			) : (
				<PopoverTrigger
					render={
						<button
							aria-label={`Ver código de barras ${barcode}`}
							className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							type="button"
						>
							<Barcode aria-hidden className="size-3.5" />
						</button>
					}
				/>
			)}
			<PopoverContent className="w-auto">
				<div className="flex flex-col items-center gap-2 p-1.5">
					<BarcodeEan13 className="w-60" code={barcode} height={64} />
					{!isValidEan13(barcode) && (
						<p className="text-muted-foreground text-xs">
							Formato fora do padrão EAN-13
						</p>
					)}
					<div className="flex items-center gap-2">
						<span className="font-mono text-sm">{barcode}</span>
						<CopyButton label={`código de barras ${barcode}`} value={barcode} />
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
