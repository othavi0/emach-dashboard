"use client";

import { TruckIcon, type TruckIconHandle } from "@emach/ui/components/truck";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function RunningTruck() {
	const ref = useRef<TruckIconHandle>(null);
	useEffect(() => {
		ref.current?.startAnimation();
	}, []);
	return <TruckIcon ref={ref} size={20} />;
}

/**
 * Caminhãozinho que corre na ponta da barra de progresso de navegação (@bprogress).
 *
 * Em vez de espelhar a posição da barra por JS (frágil: o main thread trava no freeze
 * de navegação #222, e o DOM volátil do Next dev re-dispara qualquer observer, o que
 * reinicia transições CSS), o ícone é PORTALADO para dentro da própria
 * `.bprogress .bar`. Assim herda `transform`, `transition` e o fade-out da barra
 * nativamente, tudo animado pelo compositor (GPU) — corre grudado na ponta sem nenhum
 * cálculo por frame. O balanço interno do caminhão é do TruckIcon (motion).
 *
 * `.bprogress` é filho direto do `<body>`, então um observer de `childList` no body
 * detecta início/fim da navegação. `setBar` com o mesmo elemento faz bail-out no
 * React, então re-disparos do observer são inócuos. Quando a barra é removida ao fim
 * da navegação, o portal desmonta e o caminhão some junto com ela.
 */
export function NavigationTruck() {
	const [bar, setBar] = useState<HTMLElement | null>(null);

	useEffect(() => {
		const sync = () =>
			setBar(document.querySelector<HTMLElement>(".bprogress .bar"));
		const observer = new MutationObserver(sync);
		observer.observe(document.body, { childList: true });
		sync();
		return () => observer.disconnect();
	}, []);

	if (!bar) {
		return null;
	}

	return createPortal(
		<span className="pointer-events-none absolute top-0 right-0 block translate-x-[40px] -translate-y-[4px] text-primary drop-shadow-[0_0_4px_var(--primary)] motion-reduce:hidden">
			<RunningTruck />
		</span>,
		bar
	);
}
