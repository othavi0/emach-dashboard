"use client";

import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@emach/ui/components/hover-card";
import { CircleHelp } from "lucide-react";

interface ShortProps {
	body?: never;
	example?: never;
	text: string;
	title?: never;
}
interface RichProps {
	body: string;
	example?: string;
	text?: never;
	title: string;
}
type HelpTooltipProps = (ShortProps | RichProps) & { label?: string };

const TRIGGER_CLASS =
	"inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-info focus-visible:text-info focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-transparent";

export function HelpTooltip(props: HelpTooltipProps) {
	const ariaLabel = props.label ?? "Ajuda sobre o campo";

	if ("text" in props && props.text) {
		return (
			<HoverCard>
				<HoverCardTrigger
					aria-label={ariaLabel}
					className={TRIGGER_CLASS}
					render={<button type="button" />}
				>
					<CircleHelp aria-hidden className="size-3.5" />
				</HoverCardTrigger>
				<HoverCardContent className="w-auto max-w-[240px] leading-relaxed">
					{props.text}
				</HoverCardContent>
			</HoverCard>
		);
	}

	const { title, body, example } = props as RichProps;
	return (
		<HoverCard>
			<HoverCardTrigger
				aria-label={ariaLabel}
				className={TRIGGER_CLASS}
				render={<button type="button" />}
			>
				<CircleHelp aria-hidden className="size-3.5" />
			</HoverCardTrigger>
			<HoverCardContent className="w-72">
				<p className="font-semibold text-foreground text-xs">{title}</p>
				<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
					{body}
				</p>
				{example ? (
					<p className="mt-2 rounded bg-surface-deep px-2 py-1 font-mono text-[11px] text-info">
						{example}
					</p>
				) : null}
			</HoverCardContent>
		</HoverCard>
	);
}
