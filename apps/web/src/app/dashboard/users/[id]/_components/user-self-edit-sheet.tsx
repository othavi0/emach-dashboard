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
import { z } from "zod";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { LabeledField } from "@/components/labeled-field";
import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/format/name";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { updateOwnProfile, uploadOwnAvatar } from "../../actions";
import { updateOwnProfileSchema } from "../../schema";

// E-mail não faz parte de `updateOwnProfileSchema` (que só cobre nome/foto e
// vira uma UPDATE direta na tabela `user`): a troca de e-mail exige o fluxo
// double opt-in do Better Auth (`authClient.changeEmail`), então validamos
// aqui só para dar feedback de campo consistente com o resto do form.
function buildProfilePayload(args: {
	name: string;
	initialName: string;
	parsedName: string | undefined;
	image: string | null;
	initialImage: string | null;
	parsedImage: string | null | undefined;
}): { name?: string; image?: string | null } {
	const payload: { name?: string; image?: string | null } = {};
	if (args.name !== args.initialName) {
		payload.name = args.parsedName;
	}
	if (args.image !== args.initialImage) {
		payload.image = args.parsedImage;
	}
	return payload;
}

const selfEditSchema = updateOwnProfileSchema.extend({
	email: z
		.string()
		.trim()
		.min(1, "Informe seu e-mail")
		.email("E-mail inválido")
		.transform((v) => v.toLowerCase()),
});

export function UserSelfEditSheet({
	name: initialName,
	image: initialImage,
	email: initialEmail,
}: {
	name: string;
	image: string | null;
	email: string;
}) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(initialName);
	const [image, setImage] = useState(initialImage);
	const [email, setEmail] = useState(initialEmail);
	const [uploading, setUploading] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<z.infer<typeof selfEditSchema>>();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(initialName);
			setImage(initialImage);
			setEmail(initialEmail);
			clearErrors();
		}
	}, [open, initialName, initialImage, initialEmail, clearErrors]);

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
		const parsed = selfEditSchema.safeParse({ name, image, email });
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		const profileChanged = name !== initialName || image !== initialImage;
		const emailChanged = parsed.data.email !== initialEmail;
		if (!(profileChanged || emailChanged)) {
			close();
			return;
		}
		startTransition(async () => {
			// Ordem: perfil (nome/foto, mutação direta) primeiro, depois e-mail
			// (dispara o fluxo double opt-in do Better Auth). Só fecha o sheet se
			// tudo que foi tentado deu certo — em erro, mantém aberto para retry.
			let ok = true;
			if (profileChanged) {
				const payload = buildProfilePayload({
					name,
					initialName,
					parsedName: parsed.data.name,
					image,
					initialImage,
					parsedImage: parsed.data.image,
				});
				const res = await updateOwnProfile(payload);
				if (res.ok) {
					notify.success("Dados atualizados");
				} else {
					ok = false;
					notify.error(res.error);
				}
			}
			if (emailChanged) {
				const emailRes = await authClient.changeEmail({
					newEmail: parsed.data.email,
					callbackURL: "/dashboard",
				});
				if (emailRes.error) {
					ok = false;
					notify.error("Não foi possível iniciar a troca de e-mail");
				} else {
					notify.success(
						"Enviamos um link de confirmação ao seu e-mail atual. Confirme por lá para concluir a troca."
					);
				}
			}
			if (ok) {
				close();
				router.refresh();
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
							onPickAvatar(e);
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
				<LabeledField
					error={errors.email}
					hint="Trocar o e-mail exige confirmação: enviamos um link ao seu e-mail atual antes de liberar o novo endereço."
					id="self-email"
					label="E-mail"
				>
					{(field) => (
						<Input
							{...field}
							onChange={(e) => setEmail(e.target.value)}
							type="email"
							value={email}
						/>
					)}
				</LabeledField>
			</div>
		</EntityEditSheet>
	);
}
