export function parseDateParam(value: string): Date | undefined {
	if (!value) {
		return;
	}
	const d = new Date(`${value}T00:00:00`);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatDateParam(date: Date | undefined): string {
	if (!date) {
		return "";
	}
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}
