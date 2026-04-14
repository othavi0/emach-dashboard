import { InventoryTabs } from "../_components/inventory-tabs";

export default function InventoryLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<div className="flex w-full flex-col gap-4 px-6 py-6">
			<InventoryTabs />
			<div className="flex flex-col gap-4">{children}</div>
		</div>
	);
}
