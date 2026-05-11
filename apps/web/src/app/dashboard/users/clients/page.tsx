import { requireCapabilityOrRedirect } from "@/lib/permissions";

export default async function ClientsPlaceholderPage() {
	await requireCapabilityOrRedirect("users.approve");

	return (
		<div className="flex flex-col gap-4">
			<header>
				<h1 className="font-medium text-2xl">Clientes</h1>
				<p className="text-muted-foreground text-sm">
					Em construção. Em breve.
				</p>
			</header>
		</div>
	);
}
