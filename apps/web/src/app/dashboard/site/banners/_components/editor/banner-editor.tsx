"use client";

import type { Banner } from "@emach/db/schema/banner";
import { Button } from "@emach/ui/components/button";
import { Switch } from "@emach/ui/components/switch";
import { Monitor, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useReducer, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { createBanner, updateBanner } from "../../actions";
import { type BannerFormValues, bannerFormSchema } from "../banner-schema";
import { BANNER_TEMPLATES } from "../composition/templates";
import { EditorCanvas } from "./editor-canvas";
import { editorReducer, initialEditorState } from "./editor-reducer";
import { ElementRail } from "./element-rail";
import { Inspector } from "./inspector";

export function BannerEditor({ banner }: { banner?: Banner }) {
	const router = useRouter();
	const [state, dispatch] = useReducer(
		editorReducer,
		banner ?? null,
		initialEditorState
	);
	const [pending, startTransition] = useTransition();
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<BannerFormValues>();

	function handleSave() {
		clearErrors();
		const payload: BannerFormValues = {
			...state.content,
			composition: state.composition,
		};
		const parsed = bannerFormSchema.safeParse(payload);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const r = banner
				? await updateBanner(banner.id, parsed.data)
				: await createBanner(parsed.data);
			if (r.ok) {
				notify.success(banner ? "Banner atualizado" : "Banner criado");
				router.push("/dashboard/site/banners");
				router.refresh();
			} else {
				notify.error(r.error);
			}
		});
	}

	const showTemplates = !(banner || state.dirty);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
				<div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
					<Button
						aria-pressed={state.viewport === "desktop"}
						onClick={() =>
							dispatch({ type: "setViewport", viewport: "desktop" })
						}
						size="sm"
						type="button"
						variant={state.viewport === "desktop" ? "secondary" : "ghost"}
					>
						<Monitor />
						Desktop
					</Button>
					<Button
						aria-pressed={state.viewport === "mobile"}
						onClick={() =>
							dispatch({ type: "setViewport", viewport: "mobile" })
						}
						size="sm"
						type="button"
						variant={state.viewport === "mobile" ? "secondary" : "ghost"}
					>
						<Smartphone />
						Mobile
					</Button>
				</div>

				<div className="flex flex-wrap items-center gap-4">
					<label
						className="flex items-center gap-2 text-sm"
						htmlFor="banner-editor-publish"
					>
						<Switch
							checked={state.content.isActive}
							id="banner-editor-publish"
							onCheckedChange={(c) =>
								dispatch({ type: "setContent", patch: { isActive: c } })
							}
						/>
						Publicar
					</label>
					<p className="max-w-56 text-muted-foreground text-xs">
						O site renderiza uma aproximação deste banner até a loja atualizar.
					</p>
					<Button disabled={pending} onClick={handleSave} type="button">
						Salvar
					</Button>
				</div>
			</div>

			{showTemplates && (
				<div>
					<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Começar de um template
					</p>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
						{BANNER_TEMPLATES.map((template) => (
							<button
								className="rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/50"
								key={template.key}
								onClick={() =>
									dispatch({
										type: "applyTemplate",
										templateKey: template.key,
									})
								}
								type="button"
							>
								<p className="font-medium text-sm">{template.label}</p>
								<p className="text-muted-foreground text-xs">{template.hint}</p>
							</button>
						))}
					</div>
				</div>
			)}

			<div className="grid gap-4 lg:grid-cols-[220px_1fr_320px]">
				<ElementRail dispatch={dispatch} state={state} />
				<EditorCanvas dispatch={dispatch} state={state} />
				<Inspector dispatch={dispatch} errors={errors} state={state} />
			</div>
			<FieldError>{errors._form}</FieldError>
		</div>
	);
}
