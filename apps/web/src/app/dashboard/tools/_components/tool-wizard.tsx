"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Check } from "lucide-react";
import { useState } from "react";

import { FormErrorPanel } from "@/components/form-error-panel";
import { type ToolFormState, useToolFormState } from "./tool-form-state";
import {
	getStepIssues,
	stepHasErrors,
	TOOL_STEPS,
	type ToolStepId,
} from "./tool-form-steps";
import { toolFormSchema } from "./tool-schema";
import { TOOL_SECTION_COMPONENTS } from "./tool-sections";
import { useToolSubmit } from "./use-tool-submit";

export function ToolWizard({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const { values, patch, errors, setErrors } = useToolFormState(
		defaultValues ?? {}
	);
	const { submit, isPending, issues, setIssues, errorRef } = useToolSubmit({
		mode: "create",
		values,
		setErrors,
	});
	const [active, setActive] = useState(0);

	// active é controlado por setActive com clamp — nunca sai dos bounds
	// biome-ignore lint/style/noNonNullAssertion: array constante não-vazio, índice clamped
	const step = TOOL_STEPS[Math.min(active, TOOL_STEPS.length - 1)]!;
	const Fields = TOOL_SECTION_COMPONENTS[step.id];

	// parse único por render — React Compiler memoiza sobre `values`;
	// evita 6× safeParse no loop do stepper (um por stepDone)
	const parsed = toolFormSchema.safeParse(values);

	function stepDone(stepId: ToolStepId): boolean {
		return !stepHasErrors(parsed, stepId);
	}

	function next() {
		const stepIssues = getStepIssues(values, step.id);
		setIssues(stepIssues);
		if (stepIssues.length > 0 && !step.optional) {
			return;
		}
		setActive((i) => Math.min(i + 1, TOOL_STEPS.length - 1));
	}

	return (
		<div className="flex flex-col gap-6">
			<ol
				aria-label="Etapas do cadastro"
				className="flex flex-wrap gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60"
			>
				{TOOL_STEPS.map((s, i) => {
					const done = i !== active && stepDone(s.id);
					const isActive = i === active;
					return (
						<li key={s.id}>
							<button
								aria-current={isActive ? "step" : undefined}
								className={
									isActive
										? "flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
										: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
								}
								onClick={() => setActive(i)}
								type="button"
							>
								{done ? (
									<Check aria-hidden className="size-3.5 text-success" />
								) : (
									<span>{i + 1}</span>
								)}
								{s.label}
								{s.optional && (
									<span className="text-[10px] opacity-70">(opcional)</span>
								)}
							</button>
						</li>
					);
				})}
			</ol>

			<FormErrorPanel issues={issues} ref={errorRef} />

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
					onClick={() => setActive((i) => Math.max(i - 1, 0))}
					type="button"
					variant="ghost"
				>
					‹ Voltar
				</Button>
				{active < TOOL_STEPS.length - 1 ? (
					<Button onClick={next} type="button">
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
