import {
	BanIcon,
	CheckCheckIcon,
	CheckIcon,
	ClockIcon,
	type LucideIcon,
	PackageIcon,
	RotateCcwIcon,
	TruckIcon,
	Undo2Icon,
	XCircleIcon,
} from "lucide-react";

// Vocabulário visual de status compartilhado entre badge, histórico e pendências.
// Strings (StatusIconKey/Tone) são serializáveis — server actions carregam a chave
// e o componente client resolve para ícone/cor aqui.

export type StatusIconKey =
	| "ban"
	| "check"
	| "checkCheck"
	| "clock"
	| "package"
	| "rotate"
	| "truck"
	| "undo"
	| "xCircle";

export type Tone = "destructive" | "info" | "success" | "warning";

export const STATUS_ICONS: Record<StatusIconKey, LucideIcon> = {
	ban: BanIcon,
	check: CheckIcon,
	checkCheck: CheckCheckIcon,
	clock: ClockIcon,
	package: PackageIcon,
	rotate: RotateCcwIcon,
	truck: TruckIcon,
	undo: Undo2Icon,
	xCircle: XCircleIcon,
};

export const TONE_TEXT: Record<Tone, string> = {
	destructive: "text-destructive",
	info: "text-info",
	success: "text-success",
	warning: "text-warning",
};

export const TONE_BADGE_VARIANT: Record<Tone, Tone> = {
	destructive: "destructive",
	info: "info",
	success: "success",
	warning: "warning",
};
