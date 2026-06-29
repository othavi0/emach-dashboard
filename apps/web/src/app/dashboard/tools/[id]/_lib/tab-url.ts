export function buildTabHref(
	pathname: string,
	params: URLSearchParams,
	tab: string,
	defaultValue: string,
	paramName = "tab"
): string {
	const sp = new URLSearchParams(params);
	sp.delete("variant");
	if (tab === defaultValue) {
		sp.delete(paramName);
	} else {
		sp.set(paramName, tab);
	}
	const qs = sp.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}
