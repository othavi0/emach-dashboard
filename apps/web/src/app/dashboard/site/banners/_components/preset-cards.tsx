"use client";

import { cn } from "@emach/ui/lib/utils";
import { type BannerPreset, PRESETS } from "./banner-presets";

export function PresetCards({
	selectedKey,
	onSelect,
}: {
	selectedKey: string | null;
	onSelect: (preset: BannerPreset) => void;
}) {
	return (
		<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{PRESETS.map((preset) => (
				<button
					className={cn(
						"rounded-lg border bg-card p-3 text-left transition-colors",
						selectedKey === preset.key
							? "border-primary bg-primary/5"
							: "border-border hover:border-border/60"
					)}
					key={preset.key}
					onClick={() => onSelect(preset)}
					type="button"
				>
					<span className="block font-medium text-xs">{preset.label}</span>
					<span className="mt-1 block text-[10px] text-muted-foreground leading-tight">
						{preset.hint}
					</span>
				</button>
			))}
		</div>
	);
}
