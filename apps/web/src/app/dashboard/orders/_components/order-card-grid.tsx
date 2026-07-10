import { SelectableItem } from "@/components/bulk/selectable-item";
import type { OrderListItem } from "../data";
import { OrderCard } from "./order-card";

interface OrderCardGridProps {
	highlightToolId?: string | null;
	items: OrderListItem[];
	selection?: {
		active: boolean;
		isSelected: (id: string) => boolean;
		onToggle: (id: string) => void;
	};
	tabKey: string;
}

export function OrderCardGrid({
	highlightToolId,
	items,
	selection,
	tabKey,
}: OrderCardGridProps) {
	return (
		<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
			{items.map((item) =>
				selection ? (
					<SelectableItem
						active={selection.active}
						key={item.id}
						onToggle={() => selection.onToggle(item.id)}
						selected={selection.isSelected(item.id)}
					>
						<OrderCard
							highlightToolId={highlightToolId}
							item={item}
							tabKey={tabKey}
						/>
					</SelectableItem>
				) : (
					<OrderCard
						highlightToolId={highlightToolId}
						item={item}
						key={item.id}
						tabKey={tabKey}
					/>
				)
			)}
		</div>
	);
}
