"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@emach/ui/components/toggle-group";
import { useTransition } from "react";
import type { Capability } from "@/lib/capabilities";
import { notify } from "@/lib/notify";
import {
	setSectionCapabilities,
	setUserCapability,
} from "../permissions/actions";
import {
	buildPermissionTree,
	type OverrideState,
	type SectionView,
	sectionMasterState,
} from "../permissions/permissions-view";

interface Props {
	manageableCaps: Capability[];
	overrides: [Capability, OverrideState][];
	roleDefaults: Capability[];
	targetUserId: string;
}

export function PermissionsTab({
	targetUserId,
	overrides,
	roleDefaults,
	manageableCaps,
}: Props) {
	const [pending, startTransition] = useTransition();

	const overrideMap = new Map(overrides);
	const defaultSet = new Set(roleDefaults);
	const manageable = new Set(manageableCaps);

	const tree = buildPermissionTree({
		overrides: overrideMap,
		roleDefaults: defaultSet,
		manageable,
	});

	function apply(cap: Capability, state: OverrideState) {
		startTransition(async () => {
			const res = await setUserCapability({
				targetUserId,
				capability: cap,
				state,
			});
			if (res.ok) {
				notify.success("Permissão atualizada");
			} else {
				notify.error(res.error);
			}
		});
	}

	function applySection(section: SectionView, state: OverrideState) {
		const caps = section.resources
			.flatMap((r) => r.rows)
			.filter((row) => row.editable)
			.map((row) => row.cap);
		if (caps.length === 0) {
			return;
		}
		startTransition(async () => {
			const res = await setSectionCapabilities({
				targetUserId,
				capabilities: caps,
				state,
			});
			if (res.ok) {
				notify.success("Seção atualizada");
			} else {
				notify.error(res.error);
			}
		});
	}

	return (
		<div className="flex w-0 min-w-full flex-col gap-4">
			{tree.map((section) => {
				const masterState = sectionMasterState(section);
				return (
					<section
						className="rounded-lg border border-border"
						key={section.section}
					>
						{/* Header da seção */}
						<div className="flex items-center justify-between gap-4 border-border border-b px-4 py-2.5">
							<h3 className="font-medium text-sm">{section.section}</h3>
							{masterState !== null && (
								<div className="flex items-center gap-2">
									{masterState === "mixed" && (
										<Badge className="text-[11px]" variant="secondary">
											Misto
										</Badge>
									)}
									<CapabilityTriState
										disabled={pending}
										label={`seção ${section.section}`}
										onChange={(s) => applySection(section, s)}
										value={masterState}
									/>
								</div>
							)}
						</div>

						{/* Recursos da seção */}
						<ul className="divide-y divide-border">
							{section.resources.map((rv) => (
								<li key={rv.resource}>
									<div className="flex items-center gap-3 px-4 py-2">
										<span className="w-28 shrink-0 font-medium text-sm">
											{rv.resource}
										</span>
										<div className="min-w-0 flex-1 overflow-x-auto pb-1">
											<div className="flex w-max gap-5">
												{rv.rows.map((row) => (
													<div
														className="flex shrink-0 flex-col items-center gap-1.5"
														key={row.cap}
													>
														<span className="whitespace-nowrap text-[11px] text-muted-foreground">
															{row.action}
															{" · "}
															<span className="opacity-70">
																{row.defaultOn ? "permitido" : "negado"}
															</span>
														</span>
														<CapabilityTriState
															disabled={!row.editable || pending}
															label={`${rv.resource} · ${row.action}`}
															onChange={(s) => apply(row.cap, s)}
															value={row.state}
														/>
													</div>
												))}
											</div>
										</div>
									</div>
								</li>
							))}
						</ul>
					</section>
				);
			})}
		</div>
	);
}

function CapabilityTriState({
	value,
	disabled,
	label,
	onChange,
}: {
	// "mixed" = caps da seção divergem → nenhum estado ativo (badge "Misto" ao lado).
	value: OverrideState | "mixed";
	disabled: boolean;
	label: string;
	onChange: (s: OverrideState) => void;
}) {
	const options: { key: OverrideState; label: string }[] = [
		{ key: "inherit", label: "Padrão" },
		{ key: "grant", label: "Permitir" },
		{ key: "revoke", label: "Bloquear" },
	];
	return (
		<ToggleGroup
			aria-label={`Permissão de ${label}`}
			className="shrink-0"
			disabled={disabled}
			onValueChange={(v) => {
				const next = v[0] as OverrideState | undefined;
				if (next) {
					onChange(next);
				}
			}}
			size="sm"
			value={value === "mixed" ? [] : [value]}
			variant="outline"
		>
			{options.map((opt) => (
				// Segmented conectado: cada item do ToggleGroup vem com rounded-md (base);
				// sobrescreve para arredondar só as pontas (meio reto, parece unido).
				<ToggleGroupItem
					className="rounded-none! first:rounded-l-md! last:rounded-r-md!"
					key={opt.key}
					value={opt.key}
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
