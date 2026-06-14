import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LabeledField } from "./labeled-field";

function render(ui: React.ReactElement): string {
	return renderToStaticMarkup(ui);
}

describe("LabeledField", () => {
	it("renderiza o label e o asterisco quando required", () => {
		const html = render(
			<LabeledField id="f" label="Nome" required>
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain("Nome");
		expect(html).toContain(" *");
		expect(html).toContain('for="f"');
		expect(html).toContain('id="f"');
	});

	it("não renderiza o asterisco quando não required", () => {
		const html = render(
			<LabeledField id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).not.toContain(" *");
	});

	it("injeta aria-invalid=true no controle quando há error", () => {
		const html = render(
			<LabeledField error="Obrigatório" id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain('aria-invalid="true"');
	});

	it("omite aria-invalid quando não há error", () => {
		const html = render(
			<LabeledField id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).not.toContain("aria-invalid");
	});

	it("renderiza a mensagem de erro com a âncora data-error", () => {
		const html = render(
			<LabeledField error="Obrigatório" id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain('data-error="true"');
		expect(html).toContain("Obrigatório");
	});

	it("renderiza o help e aplica a classe flex no label quando há help", () => {
		const html = render(
			<LabeledField help={<span>ajuda-aqui</span>} id="f" label="Nome">
				{(field) => <input {...field} />}
			</LabeledField>
		);
		expect(html).toContain("ajuda-aqui");
		expect(html).toContain("flex items-center gap-1.5");
	});

	it("renderiza o hint quando passado", () => {
		const html = render(
			<LabeledField hint="Markdown suportado" id="f" label="Obs">
				{(field) => <textarea {...field} />}
			</LabeledField>
		);
		expect(html).toContain("Markdown suportado");
	});
});
