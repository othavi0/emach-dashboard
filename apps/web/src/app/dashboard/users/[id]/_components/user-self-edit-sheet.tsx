"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { LabeledField } from "@/components/labeled-field";
import { getInitials } from "@/lib/format/name";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { updateOwnProfile, uploadOwnAvatar } from "../../actions";
import { updateOwnProfileSchema } from "../../schema";

export function UserSelfEditSheet({
	name: initialName,
	image: initialImage,
}: {
	name: string;
	image: string | null;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(initialName);
	const [image, setImage] = useState(initialImage);
	const [uploading, setUploading] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const { errors, reportValidationError, clearErrors } = useFormErrors();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(initialName);
			setImage(initialImage);
			clearErrors();
		}
	}, [open, initialName, initialImage, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}
		setUploading(true);
		const fd = new FormData();
		fd.set("file", file);
		const res = await uploadOwnAvatar(fd);
		setUploading(false);
		e.target.value = "";
		if (res.ok) {
			setImage(res.url);
		} else {
			notify.error(res.error);
		}
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateOwnProfileSchema.safeParse({ name, image });
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
				<div className="flex items-center gap-3">
					<Avatar className="size-14">
						{image ? <AvatarImage alt="" src={image} /> : null}
						<AvatarFallback className="rounded-[inherit] bg-muted text-base">
							{getInitials(name)}
						</AvatarFallback>
					</Avatar>
					<div className="flex flex-col gap-1">
						<Button
							disabled={uploading}
							onClick={() => fileInput.current?.click()}
							size="sm"
							type="button"
							variant="outline"
						>
							{uploading ? "Enviando…" : "Trocar foto"}
						</Button>
						<span className="text-[10px] text-muted-foreground">
							JPG/PNG/WEBP · até 2MB
						</span>
					</div>
					<input
						accept="image/png,image/jpeg,image/webp"
						className="hidden"
						onChange={(e) => {
							onPickAvatar(e).catch(() => undefined);
						}}
						ref={fileInput}
						type="file"
					/>
				</div>
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
