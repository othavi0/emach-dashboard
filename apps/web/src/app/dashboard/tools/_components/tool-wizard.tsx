"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Check, CircleAlert } from "lucide-react";
import { useState } from "react";

import { focusFirstError } from "@/lib/form-errors";
import { DraftRecoveredBanner } from "./draft-recovered-banner";
import { type ToolFormState, useToolFormState } from "./tool-form-state";
import {
	getStepErrorCount,
	getStepFieldErrors,
	STEP_FIELDS,
	stepsWithContent,
	TOOL_STEPS,
	type ToolStepId,
} from "./tool-form-steps";
import { toolFormSchema } from "./tool-schema";
import { TOOL_SECTION_COMPONENTS } from "./tool-sections";
import { useToolDraft } from "./use-tool-draft";
import { useToolSubmit } from "./use-tool-submit";

function renderStepMarker(
	showError: boolean,
	showDone: boolean,
	errCount: number,
	index: number
) {
	if (showError) {
		return (
			<span className="flex items-center gap-1 text-destructive">
				<CircleAlert aria-hidden className="size-3.5" />
				{errCount}
			</span>
		);
	}
	if (showDone) {
		return <Check aria-hidden className="size-3.5 text-success" />;
	}
	return <span>{index + 1}</span>;
}

export function ToolWizard({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const { values, patch, errors, setErrors, setValues } = useToolFormState(
		defaultValues ?? {}
	);
	const [active, setActive] = useState(0);
	const [visited, setVisited] = useState<Set<ToolStepId>>(() => new Set());

	const { recovered, discard, clear } = useToolDraft({
		values,
		setValues,
		onRestore: (restored) => setVisited(stepsWithContent(restored)),
	});

	// active é controlado por setActive com clamp — nunca sai dos bounds
	// biome-ignore lint/style/noNonNullAssertion: array constante não-vazio, índice clamped
	const step = TOOL_STEPS[Math.min(active, TOOL_STEPS.length - 1)]!;

	// Recalcula os erros inline considerando todos os passos já visitados.
	function errorsForVisited(visitedSet: Set<ToolStepId>) {
		const merged: typeof errors = {};
		for (const id of visitedSet) {
			Object.assign(merged, getStepFieldErrors(values, id));
		}
		return merged;
	}

	// Troca de passo por QUALQUER meio (aba, Voltar, Próximo): marca o passo que
	// sai como visitado, recalcula erros dos visitados e navega. Nunca bloqueia.
	function goTo(index: number) {
		const nextVisited = new Set(visited).add(step.id);
		setVisited(nextVisited);
		setErrors(errorsForVisited(nextVisited));
		setActive(Math.min(Math.max(index, 0), TOOL_STEPS.length - 1));
	}

	const handleValidationFail = (errorKeys: string[]) => {
		const idx = TOOL_STEPS.findIndex((s) =>
			(STEP_FIELDS[s.id] as readonly string[]).some((f) =>
				errorKeys.includes(f)
			)
		);
		if (idx >= 0) {
			setActive(idx);
		}
		focusFirstError();
	};
	const { submit, isPending } = useToolSubmit({
		mode: "create",
		values,
		setErrors,
		onValidationFail: handleValidationFail,
		onSuccess: clear,
	});

	const Fields = TOOL_SECTION_COMPONENTS[step.id];

	// parse único por render — React Compiler memoiza sobre `values`;
	// evita N× safeParse no loop do stepper (um por badge)
	const parsed = toolFormSchema.safeParse(values);

	return (
		<div className="flex flex-col gap-6">
			{recovered && (
				<DraftRecoveredBanner
					onDiscard={() => {
						discard();
						setVisited(new Set());
						setErrors({});
						setActive(0);
					}}
				/>
			)}
			<ol
				aria-label="Etapas do cadastro"
				className="flex flex-wrap gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60"
			>
				{TOOL_STEPS.map((s, i) => {
					const isActive = i === active;
					const isVisited = visited.has(s.id);
					const errCount = getStepErrorCount(parsed, s.id);
					const showError = isVisited && !isActive && errCount > 0;
					const showDone = isVisited && !isActive && errCount === 0;
					return (
						<li key={s.id}>
							<button
								aria-current={isActive ? "step" : undefined}
								aria-label={
									showError ? `${s.label}: ${errCount} pendência(s)` : s.label
								}
								className={
									isActive
										? "flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
										: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
								}
								onClick={() => goTo(i)}
								type="button"
							>
								{renderStepMarker(showError, showDone, errCount, i)}
								{s.label}
								{s.optional && (
									<span className="text-[10px] opacity-70">(opcional)</span>
								)}
							</button>
						</li>
					);
				})}
			</ol>

			<section className="flex flex-col gap-2 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						{step.label}
					</h2>
					<p className="text-muted-foreground text-xs">{step.description}</p>
				</div>
				<div className="pt-4">
					<Fields
						disabled={isPending}
						errors={errors}
						onPatch={patch}
						values={values}
					/>
				</div>
			</section>

			<div className="flex items-center justify-between">
				<Button
					disabled={active === 0}
					onClick={() => goTo(active - 1)}
					type="button"
					variant="ghost"
				>
					‹ Voltar
				</Button>
				{active < TOOL_STEPS.length - 1 ? (
					<Button onClick={() => goTo(active + 1)} type="button">
						Próximo ›
					</Button>
				) : (
					<Button disabled={isPending} onClick={submit} type="button">
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Criar ferramenta"
						)}
					</Button>
				)}
			</div>
		</div>
	);
}
