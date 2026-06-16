import {
	CAPABILITIES,
	type Capability,
	type NavSection,
	SECTION_ORDER,
	sectionForCapability,
} from "@/lib/capabilities";

export type OverrideState = "inherit" | "grant" | "revoke";

export interface ActionRow {
	action: string;
	cap: Capability;
	defaultOn: boolean;
	editable: boolean;
	state: OverrideState;
}
export interface ResourceView {
	resource: string;
	rows: ActionRow[];
}
export interface SectionView {
	resources: ResourceView[];
	section: NavSection;
}

// Ações destrutivas vão ao fim da linha do recurso (peso 2); "Ver" abre (peso 0).
const DESTRUCTIVE = new Set([
	"Deletar",
	"Cancelar",
	"Estornar",
	"Suspender",
	"Alterar role",
]);
function actionWeight(action: string): number {
	if (action === "Ver") {
		return 0;
	}
	return DESTRUCTIVE.has(action) ? 2 : 1;
}

export function buildPermissionTree(args: {
	overrides: Map<Capability, OverrideState>;
	roleDefaults: Set<Capability>;
	manageable: Set<Capability>;
}): SectionView[] {
	const { overrides, roleDefaults, manageable } = args;
	// section -> resource -> rows, preservando a ordem de aparição no catálogo.
	const bySection = new Map<NavSection, Map<string, ActionRow[]>>();
	const catalogOrder = new Map<string, number>();
	let idx = 0;
	for (const [cap, meta] of Object.entries(CAPABILITIES) as [
		Capability,
		(typeof CAPABILITIES)[Capability],
	][]) {
		catalogOrder.set(meta.resource, catalogOrder.get(meta.resource) ?? idx++);
		const section = sectionForCapability(cap);
		const resources = bySection.get(section) ?? new Map<string, ActionRow[]>();
		const rows = resources.get(meta.resource) ?? [];
		rows.push({
			cap,
			action: meta.action,
			defaultOn: roleDefaults.has(cap),
			state: overrides.get(cap) ?? "inherit",
			editable: manageable.has(cap),
		});
		resources.set(meta.resource, rows);
		bySection.set(section, resources);
	}

	const tree: SectionView[] = [];
	for (const section of SECTION_ORDER) {
		const resources = bySection.get(section);
		if (!resources) {
			continue;
		}
		const resourceViews: ResourceView[] = [...resources.entries()]
			.sort(
				(a, b) => (catalogOrder.get(a[0]) ?? 0) - (catalogOrder.get(b[0]) ?? 0)
			)
			.map(([resource, rows]) => ({
				resource,
				rows: [...rows].sort(
					(a, b) => actionWeight(a.action) - actionWeight(b.action)
				),
			}));
		tree.push({ section, resources: resourceViews });
	}
	return tree;
}

export function sectionMasterState(
	section: SectionView
): OverrideState | "mixed" | null {
	const states = section.resources
		.flatMap((r) => r.rows)
		.filter((row) => row.editable)
		.map((row) => row.state);
	const first = states[0];
	if (!first) {
		return null;
	}
	return states.every((s) => s === first) ? first : "mixed";
}
