// @vitest-environment happy-dom
import { Sidebar, SidebarProvider } from "@emach/ui/components/sidebar";
import { act, lazy, type ReactNode, Suspense } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// O layout do dashboard põe o SidebarProvider no shell estático e a sidebar
// num <Suspense> que chega depois por streaming. O provider hidrata primeiro,
// o efeito dele aplica o cookie/viewport, e só então o boundary hidrata contra
// o HTML que o servidor gerou com o estado default.
function Layout({ sidebar }: { sidebar: ReactNode }) {
	return (
		<SidebarProvider>
			<Suspense fallback={<p>carregando</p>}>{sidebar}</Suspense>
		</SidebarProvider>
	);
}

const appSidebar = (
	<Sidebar collapsible="icon">
		<p>menu</p>
	</Sidebar>
);

async function hydrateWithLateBoundary() {
	const container = document.createElement("div");
	container.innerHTML = renderToString(<Layout sidebar={appSidebar} />);
	document.body.append(container);

	const chrome = Promise.withResolvers<{ default: () => ReactNode }>();
	const Chrome = lazy(() => chrome.promise);

	const errors: string[] = [];

	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation((message: string) => {
			errors.push(message);
		});

	await act(async () => {
		hydrateRoot(container, <Layout sidebar={<Chrome />} />, {
			onRecoverableError: (error) => {
				errors.push(error instanceof Error ? error.message : String(error));
			},
		});
		await Promise.resolve();
	});
	await act(async () => {
		chrome.resolve({ default: () => appSidebar });
		await Promise.resolve();
	});

	consoleError.mockRestore();
	const sidebar = container.querySelector<HTMLElement>("[data-slot=sidebar]");

	return { errors, state: sidebar?.dataset.state };
}

beforeAll(() => {
	Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
	document.body.innerHTML = "";
	// biome-ignore lint/suspicious/noDocumentCookie: o teste simula o cookie que o SidebarProvider grava
	document.cookie = "sidebar_state=; max-age=0; path=/";
	window.innerWidth = 1024;
});

describe("sidebar hidratada depois do provider", () => {
	it("hidrata sem mismatch e aplica o cookie de sidebar recolhida", async () => {
		// biome-ignore lint/suspicious/noDocumentCookie: o teste simula o cookie que o SidebarProvider grava
		document.cookie = "sidebar_state=false; path=/";

		const { errors, state } = await hydrateWithLateBoundary();

		expect(errors).toEqual([]);
		expect(state).toBe("collapsed");
	});

	it("hidrata sem mismatch no viewport mobile", async () => {
		window.innerWidth = 375;

		const { errors } = await hydrateWithLateBoundary();

		expect(errors).toEqual([]);
	});
});
