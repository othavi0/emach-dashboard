"use client";

import { useTransition } from "react";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";
import { notify } from "@/lib/notify";
import { setUserCapability } from "../permissions/actions";
import type { OverrideState } from "../permissions/data";

interface Props {
	manageableCaps: Capability[];
	overrides: [Capability, OverrideState][];
	roleDefaults: Capability[];
	targetUserId: string;
}

interface Row {
	action: string;
	cap: Capability;
	defaultOn: boolean;
	description: string;
	editable: boolean;
	resource: string;
	state: OverrideState;
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
	const editableSet = new Set(manageableCaps);

	const groups = new Map<string, Row[]>();
	for (const [cap, meta] of Object.entries(CAPABILITIES) as [
		Capability,
		(typeof CAPABILITIES)[Capability],
	][]) {
		const row: Row = {
			cap,
			resource: meta.resource,
			action: meta.action,
			description: meta.description,
			defaultOn: defaultSet.has(cap),
			state: overrideMap.get(cap) ?? "inherit",
			editable: editableSet.has(cap),
		};
		const list = groups.get(meta.group) ?? [];
		list.push(row);
		groups.set(meta.group, list);
	}

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

	return (
		<div className="flex flex-col gap-6">
			{[...groups.entries()].map(([group, rows]) => (
				<section className="rounded-lg border border-border" key={group}>
					<h3 className="border-border border-b px-4 py-2.5 font-medium text-sm">
						{group}
					</h3>
					<ul className="divide-y divide-border">
						{rows.map((row) => (
							<li
								className="flex items-center justify-between gap-4 px-4 py-2.5"
								key={row.cap}
							>
								<div className="min-w-0">
									<p className="font-medium text-sm">
										{row.resource} · {row.action}
									</p>
									<p className="text-muted-foreground text-xs">
										{row.description} — padrão do nível:{" "}
										<span className="tabular-nums">
											{row.defaultOn ? "permitido" : "negado"}
										</span>
									</p>
								</div>
								<TriState
									defaultOn={row.defaultOn}
									disabled={!row.editable || pending}
									onChange={(s) => apply(row.cap, s)}
									value={row.state}
								/>
							</li>
						))}
					</ul>
				</section>
			))}
		</div>
	);
}

function TriState({
	value,
	defaultOn,
	disabled,
	onChange,
}: {
	value: OverrideState;
	defaultOn: boolean;
	disabled: boolean;
	onChange: (s: OverrideState) => void;
}) {
	const options: { key: OverrideState; label: string }[] = [
		{ key: "inherit", label: `Herdar (${defaultOn ? "sim" : "não"})` },
		{ key: "grant", label: "Conceder" },
		{ key: "revoke", label: "Revogar" },
	];
	return (
		<div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border">
			{options.map((opt) => (
				<button
					className={
						value === opt.key
							? "bg-primary px-2.5 py-1 text-primary-foreground text-xs"
							: "px-2.5 py-1 text-muted-foreground text-xs hover:bg-muted disabled:opacity-50"
					}
					disabled={disabled}
					key={opt.key}
					onClick={() => onChange(opt.key)}
					type="button"
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
