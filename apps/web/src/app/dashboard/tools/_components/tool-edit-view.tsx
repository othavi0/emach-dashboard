"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { type ToolFormState, useToolFormState } from "./tool-form-state";
import { TOOL_STEPS } from "./tool-form-steps";
import { TOOL_SECTION_COMPONENTS } from "./tool-sections";
import { useToolSubmit } from "./use-tool-submit";

export function ToolEditView({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const router = useRouter();
	const { values, patch, errors, setErrors } = useToolFormState(
		defaultValues ?? {}
	);
	const { submit, isPending } = useToolSubmit({
		mode: "edit",
		values,
		setErrors,
		initialStatus: defaultValues?.status ?? "draft",
	});
	const activeId = useActiveSection();

	return (
		<div className="flex flex-col gap-6 lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
			<nav
				aria-label="Seções do formulário"
				className="hidden lg:sticky lg:top-6 lg:flex lg:h-fit lg:flex-col lg:gap-1"
			>
				{TOOL_STEPS.map((s) => {
					const isActive = s.id === activeId;
					return (
						<a
							aria-current={isActive ? "location" : undefined}
							className={
								isActive
									? "rounded-md bg-primary/10 px-3 py-1.5 font-medium text-primary text-xs"
									: "rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
							}
							href={`#sec-${s.id}`}
							key={s.id}
							onClick={(e) => {
								e.preventDefault();
								scrollToSection(s.id);
							}}
						>
							{s.label}
						</a>
					);
				})}
			</nav>
			<div className="flex flex-col gap-6">
				{TOOL_STEPS.map((s) => {
					const Fields = TOOL_SECTION_COMPONENTS[s.id];
					return (
						<section
							className="flex scroll-mt-6 flex-col gap-2 rounded-md border border-border bg-card p-6"
							id={`sec-${s.id}`}
							key={s.id}
						>
							<div className="flex flex-col gap-1">
								<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
									{s.label}
								</h2>
								<p className="text-muted-foreground text-xs">{s.description}</p>
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
					);
				})}
				<div className="flex gap-3">
					<Button disabled={isPending} onClick={submit} type="button">
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Salvar alterações"
						)}
					</Button>
					<Button
						onClick={() => router.push("/dashboard/tools")}
						type="button"
						variant="ghost"
					>
						Cancelar
					</Button>
				</div>
			</div>
		</div>
	);
}

// Rolagem suave até a seção, respeitando prefers-reduced-motion.
// Escopado aos links da nav — o scroller é o <html>, então scroll-smooth
// global afetaria o dashboard inteiro.
function scrollToSection(id: string) {
	const target = document.getElementById(`sec-${id}`);
	if (!target) {
		return;
	}
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	target.scrollIntoView({
		behavior: reduce ? "auto" : "smooth",
		block: "start",
	});
	history.replaceState(null, "", `#sec-${id}`);
}

// Scroll-spy: marca como ativa a seção mais próxima do topo da viewport,
// destacando o item correspondente na navegação lateral.
function useActiveSection(): string {
	const [activeId, setActiveId] = useState<string>(TOOL_STEPS[0]?.id ?? "");

	useEffect(() => {
		const sections = TOOL_STEPS.map((s) =>
			document.getElementById(`sec-${s.id}`)
		).filter((el): el is HTMLElement => el !== null);

		if (sections.length === 0) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id.slice("sec-".length));
					}
				}
			},
			{ rootMargin: "-10% 0px -80% 0px" }
		);

		for (const el of sections) {
			observer.observe(el);
		}
		return () => observer.disconnect();
	}, []);

	return activeId;
}
