import {
	BanIcon,
	CheckCheckIcon,
	CheckIcon,
	ClockIcon,
	PackageIcon,
	RotateCcwIcon,
	TruckIcon,
	Undo2Icon,
	XCircleIcon,
} from "lucide-react";
import type { OrderStatus } from "../data";
import { ORDER_STATUS_LABELS } from "../status-meta";

// ─── Linear lifecycle path ──────────────────────────────────────────────────

const LINEAR_STEPS: OrderStatus[] = [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
];

// ─── Terminal states (branch off the linear path) ───────────────────────────

type TerminalState = Extract<
	OrderStatus,
	"canceled" | "returned" | "refunded" | "payment_failed"
>;

interface TerminalConfig {
	branchesFrom: OrderStatus;
	colorClass: string;
	icon: typeof ClockIcon;
	label: string;
	ringClass: string;
}

const TERMINAL_CONFIG: Record<TerminalState, TerminalConfig> = {
	canceled: {
		branchesFrom: "pending_payment",
		colorClass: "bg-destructive",
		icon: XCircleIcon,
		label: ORDER_STATUS_LABELS.canceled,
		ringClass: "ring-destructive/40",
	},
	payment_failed: {
		branchesFrom: "pending_payment",
		colorClass: "bg-destructive",
		icon: BanIcon,
		label: ORDER_STATUS_LABELS.payment_failed,
		ringClass: "ring-destructive/40",
	},
	refunded: {
		branchesFrom: "paid",
		colorClass: "bg-warning",
		icon: RotateCcwIcon,
		label: ORDER_STATUS_LABELS.refunded,
		ringClass: "ring-warning/40",
	},
	returned: {
		branchesFrom: "shipped",
		colorClass: "bg-warning",
		icon: Undo2Icon,
		label: ORDER_STATUS_LABELS.returned,
		ringClass: "ring-warning/40",
	},
};

const TERMINAL_STATUSES = new Set<OrderStatus>(
	Object.keys(TERMINAL_CONFIG) as TerminalState[]
);

const STEP_ICONS: Record<OrderStatus, typeof ClockIcon> = {
	pending_payment: ClockIcon,
	paid: CheckIcon,
	preparing: PackageIcon,
	shipped: TruckIcon,
	delivered: CheckCheckIcon,
	// terminal — each has its own in TERMINAL_CONFIG
	canceled: XCircleIcon,
	payment_failed: BanIcon,
	refunded: RotateCcwIcon,
	returned: Undo2Icon,
};

// ─── Step state ──────────────────────────────────────────────────────────────

type StepState = "done" | "current" | "upcoming";

function getStepState(
	step: OrderStatus,
	currentStatus: OrderStatus
): StepState {
	if (TERMINAL_STATUSES.has(currentStatus)) {
		// On a terminal path: all linear steps before the branch point are "done"
		const terminal = currentStatus as TerminalState;
		const config = TERMINAL_CONFIG[terminal];
		const branchIdx = LINEAR_STEPS.indexOf(config.branchesFrom);
		const stepIdx = LINEAR_STEPS.indexOf(step);
		// Steps up to and including the branch point are done
		if (stepIdx <= branchIdx) {
			return "done";
		}
		return "upcoming";
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

// ─── Sub-components ──────────────────────────────────────────────────────────

function StepCircle({
	label,
	icon: Icon,
	state,
}: {
	label: string;
	icon: typeof ClockIcon;
	state: StepState;
}) {
	const base =
		"relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors";

	const stateClasses = {
		current:
			"bg-primary text-primary-foreground ring-2 ring-ring ring-offset-2 ring-offset-background",
		done: "bg-success text-success-foreground",
		upcoming: "bg-muted border border-border text-muted-foreground",
	};

	return (
		<div
			aria-label={label}
			className={`${base} ${stateClasses[state]}`}
			role="img"
		>
			<Icon aria-hidden="true" className="size-4" />
		</div>
	);
}

function Connector({ done }: { done: boolean }) {
	return (
		<div
			aria-hidden="true"
			className={`h-px flex-1 transition-colors ${done ? "bg-success" : "bg-border"}`}
		/>
	);
}

function StepLabel({ label, state }: { label: string; state: StepState }) {
	let textClass = "text-muted-foreground/60";
	if (state === "current") {
		textClass = "text-foreground font-medium";
	} else if (state === "done") {
		textClass = "text-muted-foreground";
	}

	return (
		<span
			className={`mt-2 text-center text-[11px] uppercase leading-tight tracking-widest ${textClass}`}
		>
			{label}
		</span>
	);
}

// ─── Terminal branch display ─────────────────────────────────────────────────

function TerminalBranch({ status }: { status: TerminalState }) {
	const config = TERMINAL_CONFIG[status];
	const Icon = config.icon;

	return (
		<div className="mt-3 flex items-center gap-2 border-border border-t pt-3">
			<span className="text-muted-foreground/60 text-xs">Estado final:</span>
			<div
				className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-xs ring-2 ${config.colorClass} ${config.ringClass} text-foreground`}
			>
				<Icon aria-hidden="true" className="size-3.5" />
				{config.label}
			</div>
		</div>
	);
}

// ─── Main component ──────────────────────────────────────────────────────────

interface OrderLifecycleStepperProps {
	status: OrderStatus;
}

export function OrderLifecycleStepper({ status }: OrderLifecycleStepperProps) {
	const isTerminal = TERMINAL_STATUSES.has(status);

	return (
		<div className="rounded-lg border border-border bg-card px-5 py-4">
			<p className="mb-4 font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
				Ciclo de vida
			</p>

			{/* Linear steps row */}
			<ol aria-label="Etapas do pedido" className="flex items-center gap-0">
				{LINEAR_STEPS.map((step, idx) => {
					const state = getStepState(step, status);
					const Icon = STEP_ICONS[step];
					const isLast = idx === LINEAR_STEPS.length - 1;

					return (
						<li
							aria-current={state === "current" ? "step" : undefined}
							className="flex flex-1 flex-col items-center"
							key={step}
						>
							<div className="flex w-full items-center">
								{/* Left connector (skip for first) */}
								{idx > 0 && (
									<Connector
										done={
											state === "done" || (state === "current" && !isTerminal)
										}
									/>
								)}

								<StepCircle
									icon={Icon}
									label={ORDER_STATUS_LABELS[step]}
									state={state}
								/>

								{/* Right connector (skip for last) */}
								{!isLast && <Connector done={state === "done"} />}
							</div>

							<StepLabel label={ORDER_STATUS_LABELS[step]} state={state} />
						</li>
					);
				})}
			</ol>

			{/* Terminal branch — only shown when order is in a terminal state */}
			{isTerminal && <TerminalBranch status={status as TerminalState} />}
		</div>
	);
}
