import { SelectableItem } from "@/components/bulk/selectable-item";
import type { OrderListItem } from "../data";
import { OrderCard } from "./order-card";

interface OrderCardGridProps {
	items: OrderListItem[];
	selection?: {
		active: boolean;
		isSelected: (id: string) => boolean;
		onToggle: (id: string) => void;
	};
}

export function OrderCardGrid({ items, selection }: OrderCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{items.map((item) =>
				selection ? (
					<SelectableItem
						active={selection.active}
						key={item.id}
						onToggle={() => selection.onToggle(item.id)}
						selected={selection.isSelected(item.id)}
					>
						<OrderCard item={item} />
					</SelectableItem>
				) : (
					<OrderCard item={item} key={item.id} />
				)
			)}
		</div>
	);
}
