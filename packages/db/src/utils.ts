export function toDate(value: Date | string): Date;
export function toDate(value: Date | string | null | undefined): Date | null;
export function toDate(value: Date | string | null | undefined): Date | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		return value;
	}
	return new Date(value);
}
