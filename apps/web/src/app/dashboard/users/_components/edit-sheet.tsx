"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
	deleteUser,
	suspendUser,
	triggerPasswordReset,
	updateUser,
} from "../actions";
import { BranchesCombobox } from "./branches-combobox";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

interface Props {
	allowedRoles?: UserRow["role"][];
	branches: BranchLite[];
	onClose: () => void;
	user: UserRow | null;
}

export function EditSheet({
	user,
	branches,
	onClose,
	allowedRoles = ["admin", "manager", "user"],
}: Props) {
	const [name, setName] = useState("");
	const [role, setRole] = useState<UserRow["role"]>("user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [, startTransition] = useTransition();

	useEffect(() => {
		if (user) {
			setName(user.name);
			setRole(user.role);
			setBranchIds(user.branchIds);
		}
	}, [user]);

	function handleSave() {
		if (!user) {
			return;
		}
		setSubmitting(true);
		startTransition(async () => {
			const result = await updateUser({
				userId: user.id,
				name: name === user.name ? undefined : name,
				role: role === user.role ? undefined : role,
				branchIds,
			});
			setSubmitting(false);
			if (result.ok) {
				toast.success("Alterações salvas");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleSuspend() {
		if (!user) {
			return;
		}
		setSubmitting(true);
		startTransition(async () => {
			const result = await suspendUser({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Usuário suspenso");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleReset() {
		if (!user) {
			return;
		}
		setSubmitting(true);
		startTransition(async () => {
			const result = await triggerPasswordReset({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("E-mail de reset enviado");
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleDelete() {
		if (!user) {
			return;
		}
		setSubmitting(true);
		startTransition(async () => {
			const result = await deleteUser({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Usuário deletado");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={!!user}>
			<SheetContent className="flex flex-col gap-4 overflow-y-auto">
				<SheetHeader>
					<SheetTitle>{user ? `Editar ${user.name}` : ""}</SheetTitle>
				</SheetHeader>
				{user && (
					<>
						<div className="flex flex-col gap-2">
							<Label>Nome</Label>
							<Input
								disabled={submitting}
								onChange={(e) => setName(e.target.value)}
								value={name}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>Role</Label>
							<RoleSelect
								allowedRoles={allowedRoles}
								disabled={submitting}
								onChange={setRole}
								value={role}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>Filiais</Label>
							<BranchesCombobox
								branches={branches}
								disabled={submitting || role === "super_admin"}
								onChange={setBranchIds}
								value={branchIds}
							/>
						</div>

						<Button disabled={submitting} onClick={handleSave}>
							Salvar alterações
						</Button>

						<hr className="border-border" />
						<span className="text-muted-foreground text-xs uppercase">
							Ações
						</span>

						<AlertDialog>
							<AlertDialogTrigger
								disabled={submitting}
								render={<Button variant="outline">Suspender acesso</Button>}
							/>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Suspender {user.name}?</AlertDialogTitle>
									<AlertDialogDescription>
										Sessões ativas serão encerradas. Reversível.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancelar</AlertDialogCancel>
									<AlertDialogAction onClick={handleSuspend}>
										Suspender
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<Button
							disabled={submitting}
							onClick={handleReset}
							variant="outline"
						>
							Forçar reset de senha
						</Button>

						<AlertDialog>
							<AlertDialogTrigger
								disabled={submitting}
								render={
									<Button variant="destructive">Deletar permanentemente</Button>
								}
							/>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Deletar {user.name}?</AlertDialogTitle>
									<AlertDialogDescription>
										Operação irreversível. Auditoria mantida via actor=system.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Cancelar</AlertDialogCancel>
									<AlertDialogAction onClick={handleDelete}>
										Deletar
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<SheetClose
							disabled={submitting}
							render={<Button variant="ghost">Fechar</Button>}
						/>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
