"use client";

import { Button } from "@emach/ui/components/button";
import { Calendar } from "@emach/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { cn } from "@emach/ui/lib/utils";
import { format, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

interface DateRangePickerProps {
	"aria-label"?: string;
	className?: string;
	from?: Date;
	id?: string;
	onChange: (range: { from?: Date; to?: Date }) => void;
	to?: Date;
}

const PRESETS = [
	{
		key: "today",
		label: "Hoje",
		range: (now: Date) => ({ from: now, to: now }),
	},
	{
		key: "7d",
		label: "Últimos 7 dias",
		range: (now: Date) => ({ from: subDays(now, 6), to: now }),
	},
	{
		key: "30d",
		label: "Últimos 30 dias",
		range: (now: Date) => ({ from: subDays(now, 29), to: now }),
	},
	{
		key: "month",
		label: "Este mês",
		range: (now: Date) => ({ from: startOfMonth(now), to: now }),
	},
] as const;

function label(from?: Date, to?: Date) {
	if (from && to) {
		return `${format(from, "dd/MM/yy", { locale: ptBR })} – ${format(to, "dd/MM/yy", { locale: ptBR })}`;
	}
	if (from) {
		return `A partir de ${format(from, "dd/MM/yy", { locale: ptBR })}`;
	}
	return null;
}

function DateRangePicker({
	from,
	to,
	onChange,
	id,
	className,
	"aria-label": ariaLabel,
}: DateRangePickerProps) {
	const [open, setOpen] = useState(false);
	const current = label(from, to);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				render={
					<Button
						aria-label={ariaLabel ?? "Período"}
						className={cn(
							"justify-start font-normal",
							!current && "text-muted-foreground",
							className
						)}
						id={id}
						type="button"
						variant="outline"
					>
						<CalendarIcon className="mr-2 size-4" />
						{current ?? <span>Período</span>}
					</Button>
				}
			/>
			<PopoverContent align="start" className="flex w-auto gap-2 p-2.5">
				<div className="flex flex-col gap-1 border-border border-r pr-2">
					{PRESETS.map((p) => (
						<Button
							key={p.key}
							onClick={() => {
								onChange(p.range(new Date()));
								setOpen(false);
							}}
							size="sm"
							type="button"
							variant="ghost"
						>
							{p.label}
						</Button>
					))}
					<Button
						onClick={() => {
							onChange({ from: undefined, to: undefined });
							setOpen(false);
						}}
						size="sm"
						type="button"
						variant="ghost"
					>
						Limpar
					</Button>
				</div>
				<Calendar
					autoFocus
					locale={ptBR}
					mode="range"
					numberOfMonths={2}
					onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
					selected={{ from, to }}
				/>
			</PopoverContent>
		</Popover>
	);
}

export { DateRangePicker };
