"use client";

import { Button } from "@emach/ui/components/button";

export function PrintButton() {
	return (
		<Button onClick={() => window.print()} variant="default">
			Imprimir
		</Button>
	);
}
