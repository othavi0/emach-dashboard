"use client";

import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Info, Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	linkUserToBranchAction,
	unlinkUserFromBranchAction,
} from "../../actions";

interface Props {
	branchId: string;
}

export function TeamLinkPanel({ branchId }: Props) {
	const router = useRouter();
	const [userId, setUserId] = useState("");
	const [pending, setPending] = useState(false);
	const [feedback, setFeedback] = useState<{
		ok: boolean;
		message: string;
	} | null>(null);

	async function handleLink() {
		const trimmed = userId.trim();
		if (!trimmed) {
			return;
		}
		setPending(true);
		setFeedback(null);
		try {
			const result = await linkUserToBranchAction({
				userId: trimmed,
				branchId,
			});
			if (result.ok) {
				setFeedback({ ok: true, message: "Usuário vinculado com sucesso." });
				setUserId("");
				router.refresh();
			} else {
				setFeedback({ ok: false, message: result.error });
			}
		} finally {
			setPending(false);
		}
	}

	async function handleUnlink() {
		const trimmed = userId.trim();
		if (!trimmed) {
			return;
		}
		setPending(true);
		setFeedback(null);
		try {
			const result = await unlinkUserFromBranchAction({
				userId: trimmed,
				branchId,
			});
			if (result.ok) {
				setFeedback({ ok: true, message: "Usuário desvinculado." });
				setUserId("");
				router.refresh();
			} else {
				setFeedback({ ok: false, message: result.error });
			}
		} finally {
			setPending(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					<UserPlus aria-hidden className="size-4" />
					Vincular / desvincular usuário
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<Alert variant="default">
					<Info aria-hidden className="size-4" />
					<AlertDescription className="text-xs">
						{/* TODO Task 11: substituir por combobox com busca de usuários */}
						Informe o ID do usuário. Combobox com busca virá em iteração futura.
					</AlertDescription>
				</Alert>

				<div className="flex flex-col gap-1.5">
					<Label htmlFor="team-link-user-id">ID do usuário</Label>
					<Input
						disabled={pending}
						id="team-link-user-id"
						onChange={(e) => setUserId(e.target.value)}
						placeholder="uuid do usuário"
						value={userId}
					/>
				</div>

				{feedback ? (
					<p
						className={
							feedback.ok ? "text-success text-xs" : "text-destructive text-xs"
						}
					>
						{feedback.message}
					</p>
				) : null}

				<div className="flex gap-2">
					<Button
						className="flex-1"
						disabled={pending || !userId.trim()}
						onClick={handleLink}
						size="sm"
					>
						{pending ? (
							<Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
						) : (
							<UserPlus aria-hidden className="mr-1.5 size-3.5" />
						)}
						Vincular
					</Button>
					<Button
						disabled={pending || !userId.trim()}
						onClick={handleUnlink}
						size="sm"
						variant="outline"
					>
						Desvincular
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
