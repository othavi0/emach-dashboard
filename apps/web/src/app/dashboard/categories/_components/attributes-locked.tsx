import { Lock } from "lucide-react";

export function AttributesLocked() {
	return (
		<section className="flex flex-col gap-4 rounded-md border border-border border-dashed bg-card p-6">
			<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
				Atributos
			</h2>
			<div className="flex flex-col items-center gap-2 py-6 text-center">
				<Lock aria-hidden className="size-5 text-muted-foreground" />
				<p className="font-medium text-sm">Disponível depois de salvar</p>
				<p className="max-w-sm text-muted-foreground text-xs">
					Salve a categoria para definir atributos próprios. Ela já herda
					automaticamente os atributos das categorias-pai.
				</p>
			</div>
		</section>
	);
}
