"use client";

import { Switch } from "@emach/ui/components/switch";
import { cn } from "@emach/ui/lib/utils";
import { RotateCcw } from "lucide-react";
import {
	ELEMENT_KEYS,
	type ElementKey,
} from "../composition/composition-schema";
import type { EditorAction, EditorState } from "./editor-reducer";

// Rótulos PT na ordem de ELEMENT_KEYS — reaproveitado pelo inspector para o
// cabeçalho da seção do elemento selecionado.
export const ELEMENT_LABELS: Record<ElementKey, string> = {
	badge: "Badge",
	title: "Título",
	subtitle: "Descrição",
	specs: "Ficha técnica",
	countdown: "Countdown",
	product: "Produto",
	cta: "Botão",
};

type MobileStatus = "herdado" | "override" | "oculto";

const MOBILE_STATUS_LABEL: Record<MobileStatus, string> = {
	herdado: "herdado",
	override: "override",
	oculto: "oculto",
};

function mobileStatus(state: EditorState, key: ElementKey): MobileStatus {
	const entry = Reflect.get(state.composition.mobile.elements, key);
	if (entry === undefined) {
		return "herdado";
	}
	if (typeof entry === "object" && entry !== null && "hidden" in entry) {
		return "oculto";
	}
	return "override";
}

function isDesktopEnabled(state: EditorState, key: ElementKey): boolean {
	return Reflect.get(state.composition.desktop.elements, key) !== undefined;
}

function ElementRow({
	elementKey,
	state,
	dispatch,
}: {
	elementKey: ElementKey;
	state: EditorState;
	dispatch: (a: EditorAction) => void;
}) {
	const enabled = isDesktopEnabled(state, elementKey);
	const selected = state.selected === elementKey;
	const status =
		state.viewport === "mobile" ? mobileStatus(state, elementKey) : null;

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
				selected ? "bg-primary/10" : "hover:bg-muted/50"
			)}
		>
			<Switch
				checked={enabled}
				onCheckedChange={(checked) =>
					dispatch({ type: "toggleElement", enabled: checked, key: elementKey })
				}
				size="sm"
			/>
			<button
				className={cn(
					"flex-1 text-left text-sm",
					enabled ? "text-foreground" : "text-muted-foreground"
				)}
				onClick={() => dispatch({ type: "select", target: elementKey })}
				type="button"
			>
				{ELEMENT_LABELS[elementKey]}
			</button>
			{status && enabled && (
				<div className="flex items-center gap-1">
					<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wide">
						{MOBILE_STATUS_LABEL[status]}
					</span>
					{status !== "herdado" && (
						<button
							aria-label="Resetar para a pilha segura"
							className="text-muted-foreground hover:text-foreground"
							onClick={() =>
								dispatch({
									type: "setMobileOverride",
									key: elementKey,
									override: null,
								})
							}
							type="button"
						>
							<RotateCcw className="size-3.5" />
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export function ElementRail({
	state,
	dispatch,
}: {
	state: EditorState;
	dispatch: (a: EditorAction) => void;
}) {
	const backgroundSelected = state.selected === "background";
	return (
		<div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-2">
			<p className="px-2 pt-1 pb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
				Elementos
			</p>
			{ELEMENT_KEYS.map((key) => (
				<ElementRow
					dispatch={dispatch}
					elementKey={key}
					key={key}
					state={state}
				/>
			))}
			<div className="mt-1 border-border border-t pt-1">
				<button
					className={cn(
						"w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
						backgroundSelected
							? "bg-primary/10 text-foreground"
							: "text-muted-foreground hover:bg-muted/50"
					)}
					onClick={() => dispatch({ type: "select", target: "background" })}
					type="button"
				>
					Fundo
				</button>
			</div>
		</div>
	);
}
