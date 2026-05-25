export interface BranchAddressLike {
	city?: string | null;
	neighborhood?: string | null;
	state?: string | null;
	street?: string | null;
	streetNumber?: string | null;
}

export function formatBranchAddress(b: BranchAddressLike): string | null {
	if (!(b.street || b.city)) {
		return null;
	}
	const streetPart =
		b.street && b.streetNumber ? `${b.street}, ${b.streetNumber}` : b.street;
	const cityPart =
		b.city && b.state ? `${b.city}/${b.state}` : (b.city ?? b.state ?? null);
	const parts = [streetPart, b.neighborhood, cityPart].filter(Boolean);
	return parts.length > 0 ? parts.join(" — ") : null;
}

export function formatCep(raw: string | null | undefined): string | null {
	if (!raw) {
		return null;
	}
	const digits = raw.replace(/\D/g, "");
	if (digits.length !== 8) {
		return null;
	}
	return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
