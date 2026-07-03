"use client";

import { Input } from "@emach/ui/components/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { updateOwnProfile } from "../../actions";
import { updateOwnProfileSchema } from "../../schema";

export function UserSelfEditSheet({ name: initialName }: { name: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(initialName);
	const { errors, reportValidationError, clearErrors } = useFormErrors();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(initialName);
			clearErrors();
		}
	}, [open, initialName, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateOwnProfileSchema.safeParse({ name });
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateOwnProfile(parsed.data);
			if (res.ok) {
				notify.success("Dados atualizados");
				close();
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize seus dados básicos."
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title="Editar meus dados"
		>
			<div className="flex flex-col gap-4">
				<LabeledField error={errors.name} id="self-name" label="Nome">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setName(e.target.value)}
							value={name}
						/>
					)}
				</LabeledField>
			</div>
		</EntityEditSheet>
	);
}
