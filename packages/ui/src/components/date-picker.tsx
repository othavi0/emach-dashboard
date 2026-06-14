"use client";

import { Button } from "@emach/ui/components/button";
import { Calendar } from "@emach/ui/components/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { cn } from "@emach/ui/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";

interface DatePickerProps {
	align?: "start" | "center" | "end";
	"aria-invalid"?: boolean;
	"aria-label"?: string;
	className?: string;
	disabled?: boolean;
	id?: string;
	max?: Date;
	min?: Date;
	name?: string;
	onChange?: (date: Date | undefined) => void;
	placeholder?: string;
	value?: Date;
}

function DatePicker({
	value,
	onChange,
	placeholder = "Selecionar data",
	disabled,
	min,
	max,
	align = "start",
	id,
	name,
	className,
	"aria-invalid": ariaInvalid,
	"aria-label": ariaLabel,
}: DatePickerProps) {
	const [open, setOpen] = useState(false);

	const handleSelect = (date: Date | undefined) => {
		onChange?.(date);
		setOpen(false);
	};

	const isDisabled = (d: Date) => {
		if (min && d < startOfDay(min)) {
			return true;
		}
		if (max && d > endOfDay(max)) {
			return true;
		}
		return false;
	};

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				disabled={disabled}
				render={
					<Button
						aria-invalid={ariaInvalid}
						aria-label={ariaLabel ?? placeholder}
						className={cn(
							"justify-start font-normal",
							!value && "text-muted-foreground",
							className
						)}
						id={id}
						type="button"
						variant="outline"
					>
						<CalendarIcon className="mr-2 size-4" />
						{value ? (
							format(value, "dd/MM/yyyy", { locale: ptBR })
						) : (
							<span>{placeholder}</span>
						)}
					</Button>
				}
			/>
			<PopoverContent align={align} className="w-auto p-2.5">
				<Calendar
					autoFocus
					disabled={isDisabled}
					locale={ptBR}
					mode="single"
					onSelect={handleSelect}
					selected={value}
				/>
			</PopoverContent>
			{name && (
				<input name={name} type="hidden" value={value?.toISOString() ?? ""} />
			)}
		</Popover>
	);
}

function startOfDay(d: Date) {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

function endOfDay(d: Date) {
	const x = new Date(d);
	x.setHours(23, 59, 59, 999);
	return x;
}

export { DatePicker };
