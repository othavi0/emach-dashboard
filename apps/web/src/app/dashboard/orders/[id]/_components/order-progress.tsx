import { STATUS_ICONS } from "@/components/status-visual";
import { OrderStatusBadge } from "../../_components/order-status-badge";
import type { OrderDetail, OrderStatus } from "../../data";
import { ORDER_STATUS_META } from "../../status-meta";

// ─── Types ────────────────────────────────────────────────────────────────────

type TerminalState = Extract<
	OrderStatus,
	"canceled" | "returned" | "refunded" | "payment_failed"
>;

type StepState = "done" | "current" | "upcoming";

// ─── Linear lifecycle ─────────────────────────────────────────────────────────

const LINEAR_STEPS: OrderStatus[] = [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
];

const TERMINAL_STATUSES = new Set<OrderStatus>([
	"canceled",
	"returned",
	"refunded",
	"payment_failed",
]);

const TERMINAL_BRANCH_FROM: Record<TerminalState, OrderStatus> = {
	canceled: "pending_payment",
	payment_failed: "pending_payment",
	refunded: "paid",
	returned: "shipped",
};

// ─── Timestamp mapping ────────────────────────────────────────────────────────

type TimestampFields = Pick<
	OrderDetail,
	| "status"
	| "createdAt"
	| "paidAt"
	| "preparingAt"
	| "shippedAt"
	| "deliveredAt"
	| "canceledAt"
>;

type LinearStep =
	| "pending_payment"
	| "paid"
	| "preparing"
	| "shipped"
	| "delivered";

const STEP_TIMESTAMP: Record<LinearStep, keyof TimestampFields> = {
	pending_payment: "createdAt",
	paid: "paidAt",
	preparing: "preparingAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStepState(
	step: OrderStatus,
	currentStatus: OrderStatus
): StepState {
	if (TERMINAL_STATUSES.has(currentStatus)) {
		const branchFrom = TERMINAL_BRANCH_FROM[currentStatus as TerminalState];
		const branchIdx = LINEAR_STEPS.indexOf(branchFrom);
		const stepIdx = LINEAR_STEPS.indexOf(step);
		return stepIdx <= branchIdx ? "done" : "upcoming";
	}
	const currentIdx = LINEAR_STEPS.indexOf(currentStatus);
	const stepIdx = LINEAR_STEPS.indexOf(step);
	if (stepIdx < currentIdx) {
		return "done";
	}
	if (stepIdx === currentIdx) {
		return "current";
	}
	return "upcoming";
}

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

function formatTs(date: Date | null | undefined): string | null {
	if (!date) {
		return null;
	}
	return DATE_FMT.format(date);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function VStepCircle({
	label,
	state,
	iconKey,
}: {
	label: string;
	state: StepState;
	iconKey: keyof typeof STATUS_ICONS;
}) {
	const Icon = STATUS_ICONS[iconKey];

	const stateClasses: Record<StepState, string> = {
		current:
			"bg-primary text-primary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background",
		done: "bg-success text-success-foreground",
		upcoming: "bg-muted border border-border text-muted-foreground",
	};

	return (
		<div
			aria-label={label}
			className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors ${stateClasses[state]}`}
			role="img"
		>
			<Icon aria-hidden="true" className="size-4" />
		</div>
	);
}

function VConnector({ done }: { done: boolean }) {
	return (
		<div
			aria-hidden="true"
			className={`ml-[15px] h-6 w-0.5 transition-colors ${done ? "bg-success" : "bg-border"}`}
		/>
	);
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OrderProgressProps {
	order: OrderDetail;
}

export function OrderProgress({ order }: OrderProgressProps) {
	const isTerminal = TERMINAL_STATUSES.has(order.status);

	return (
		<div className="rounded-lg border border-border bg-card px-5 py-4">
			<p className="mb-4 font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
				Andamento
			</p>

			<ol aria-label="Andamento do pedido">
				{LINEAR_STEPS.map((step, idx) => {
					const state = getStepState(step, order.status);
					const meta = ORDER_STATUS_META[step];
					const tsKey = STEP_TIMESTAMP[step as LinearStep];
					const timestamp = formatTs(
						order[tsKey as Exclude<typeof tsKey, "status">] as Date | null
					);
					const isLast = idx === LINEAR_STEPS.length - 1;
					const connectorDone =
						state === "done" ||
						(state === "current" &&
							!isTerminal &&
							idx < LINEAR_STEPS.length - 1);

					let labelClass = "text-muted-foreground/60";
					if (state === "current") {
						labelClass = "text-foreground font-medium";
					} else if (state === "done") {
						labelClass = "text-muted-foreground";
					}

					return (
						<li
							aria-current={state === "current" ? "step" : undefined}
							key={step}
						>
							<div className="flex items-start gap-3">
								<div className="flex flex-col items-center">
									<VStepCircle
										iconKey={meta.iconKey}
										label={meta.label}
										state={state}
									/>
									{!isLast && <VConnector done={connectorDone} />}
								</div>

								<div className="flex flex-col pt-1 pb-1">
									<span className={`text-[13px] leading-tight ${labelClass}`}>
										{meta.label}
									</span>
									{timestamp ? (
										<span className="mt-0.5 text-[11px] text-muted-foreground/60">
											{timestamp}
										</span>
									) : null}
								</div>
							</div>
						</li>
					);
				})}
			</ol>

			{isTerminal && (
				<div className="mt-3 flex items-center gap-2 border-border border-t pt-3">
					<span className="text-muted-foreground/60 text-xs">
						Estado final:
					</span>
					<OrderStatusBadge status={order.status} />
				</div>
			)}
		</div>
	);
}
