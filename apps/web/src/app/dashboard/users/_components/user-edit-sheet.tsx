"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Switch } from "@emach/ui/components/switch";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { FieldError } from "@/components/field-error";
import { useFormErrors } from "@/lib/form-errors";
import { notify } from "@/lib/notify";
import { allowedApprovalRoles } from "../_lib/approval-roles";
import { updateUser } from "../actions";
import { updateUserSchema } from "../schema";
import { RoleSelect } from "./role-select";
import type { UserRow } from "./types";

interface Props {
	actorRole: UserRow["role"];
	user: {
		id: string;
		name: string;
		role: UserRow["role"];
		emailVerified: boolean;
	};
}

export function UserEditSheet({ user, actorRole }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const allowed = allowedApprovalRoles(actorRole);

	const [name, setName] = useState(user.name);
	const [role, setRole] = useState<UserRow["role"]>(user.role);
	const [emailVerified, setEmailVerified] = useState(user.emailVerified);
	const { errors, reportValidationError, clearErrors } = useFormErrors();
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(user.name);
			setRole(user.role);
			setEmailVerified(user.emailVerified);
			clearErrors();
		}
	}, [open, user, clearErrors]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateUserSchema.safeParse({
			userId: user.id,
			name,
			role,
			emailVerified,
		});
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const res = await updateUser(parsed.data);
			if (res.ok) {
				notify.success("Usuário atualizado");
				close();
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize nome, cargo e verificação de e-mail. Filiais são geridas na aba Filiais."
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${user.name}`}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="user-name">Nome</Label>
					<Input
						aria-invalid={errors.name ? true : undefined}
						id="user-name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
					<FieldError>{errors.name}</FieldError>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Cargo</Label>
					<RoleSelect allowedRoles={allowed} onChange={setRole} value={role} />
				</div>
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="email-verified">E-mail verificado</Label>
					<Switch
						checked={emailVerified}
						id="email-verified"
						onCheckedChange={setEmailVerified}
					/>
				</div>
			</div>
		</EntityEditSheet>
	);
}
