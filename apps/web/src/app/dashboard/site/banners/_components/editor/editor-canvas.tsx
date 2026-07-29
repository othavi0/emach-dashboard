"use client";

import { cn } from "@emach/ui/lib/utils";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";
import { CompositionRenderer } from "../composition/composition-renderer";
import type { ElementKey } from "../composition/composition-schema";
import type { EditorAction, EditorState } from "./editor-reducer";

// Abaixo disso, um pointerdown→pointerup sem deslocamento relevante conta
// como clique (só seleciona), não drag.
const DRAG_THRESHOLD_PX = 4;

interface DragTracker {
	key: ElementKey;
	lastClientX: number;
	lastClientY: number;
	moved: boolean;
	pointerId: number;
}

export function EditorCanvas({
	state,
	dispatch,
}: {
	state: EditorState;
	dispatch: (a: EditorAction) => void;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragTracker | null>(null);
	const [dragging, setDragging] = useState(false);

	function handleElementPointerDown(
		key: ElementKey,
		e: ReactPointerEvent<Element>
	) {
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragRef.current = {
			key,
			pointerId: e.pointerId,
			lastClientX: e.clientX,
			lastClientY: e.clientY,
			moved: false,
		};
	}

	function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		const container = containerRef.current;
		if (!(drag && container) || drag.pointerId !== e.pointerId) {
			return;
		}
		const deltaClientX = e.clientX - drag.lastClientX;
		const deltaClientY = e.clientY - drag.lastClientY;
		if (
			!drag.moved &&
			Math.hypot(deltaClientX, deltaClientY) < DRAG_THRESHOLD_PX
		) {
			return;
		}
		if (!drag.moved) {
			drag.moved = true;
			setDragging(true);
			dispatch({ type: "select", target: drag.key });
		}
		const rect = container.getBoundingClientRect();
		const deltaX = (deltaClientX / rect.width) * 100;
		const deltaY = (deltaClientY / rect.height) * 100;
		dispatch({ type: "drag", key: drag.key, deltaX, deltaY });
		drag.lastClientX = e.clientX;
		drag.lastClientY = e.clientY;
	}

	function endDrag(e: ReactPointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) {
			return;
		}
		if (!drag.moved) {
			dispatch({ type: "select", target: drag.key });
		}
		dragRef.current = null;
		setDragging(false);
	}

	return (
		<div
			className={cn(
				"relative mx-auto w-full overflow-hidden rounded-xl border border-border",
				state.viewport === "desktop"
					? "aspect-video"
					: "aspect-[9/16] max-w-[300px]"
			)}
			onPointerCancel={endDrag}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			ref={containerRef}
		>
			<CompositionRenderer
				banner={state.content}
				composition={state.composition}
				onElementPointerDown={handleElementPointerDown}
				selected={state.selected}
				viewport={state.viewport}
			/>
			{dragging && (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 z-20 grid grid-cols-3 grid-rows-3 opacity-40"
				>
					{[0, 1, 2, 3, 4, 5, 6, 7, 8].map((cell) => (
						// key por índice ok: grid fantasma decorativa, 9 células fixas sem ID.
						<div className="border border-white/15 border-dashed" key={cell} />
					))}
				</div>
			)}
		</div>
	);
}
