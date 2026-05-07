"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@emach/ui/components/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createEditorialReview } from "../actions";
import { createEditorialReviewSchema } from "../schema";

interface ToolOption {
	id: string;
	name: string;
}

interface ClientOption {
	email: string;
	id: string;
	name: string;
}

interface Props {
	clients: ClientOption[];
	tools: ToolOption[];
}

export function EditorialReviewForm({ tools, clients }: Props) {
	const router = useRouter();
	const [toolId, setToolId] = useState("");
	const [clientId, setClientId] = useState("");
	const [rating, setRating] = useState<number>(5);
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [status, setStatus] = useState<"pending" | "approved">("approved");
	const [errors, setErrors] = useState<string[]>([]);
	const [isPending, startTransition] = useTransition();

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors([]);

		const parsed = createEditorialReviewSchema.safeParse({
			toolId,
			clientId,
			rating,
			title: title.trim() || undefined,
			body,
			status,
		});

		if (!parsed.success) {
			setErrors(parsed.error.issues.map((i) => i.message));
			toast.error(
				`${parsed.error.issues.length} erro(s) — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			try {
				const result = await createEditorialReview(parsed.data);
				if (!result.ok) {
					setErrors([result.error]);
					toast.error(result.error);
					return;
				}
				toast.success("Avaliação editorial criada");
				router.push("/dashboard/reviews?status=approved");
				router.refresh();
			} catch {
				toast.error("Erro inesperado");
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Nova avaliação editorial</CardTitle>
				<CardDescription>
					Avaliação curada pelo time, sem vínculo com pedido. Marcada como
					não-verificada.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-4" onSubmit={handleSubmit}>
					{errors.length > 0 && (
						<ul className="list-disc rounded-md border border-destructive/40 bg-destructive/10 p-3 pl-6 text-destructive text-sm">
							{errors.map((e) => (
								<li key={e}>{e}</li>
							))}
						</ul>
					)}

					<div className="space-y-2">
						<Label htmlFor="toolId">Ferramenta</Label>
						<Select onValueChange={(v) => setToolId(v ?? "")} value={toolId}>
							<SelectTrigger id="toolId">
								<SelectValue placeholder="Selecione a ferramenta" />
							</SelectTrigger>
							<SelectContent>
								{tools.map((t) => (
									<SelectItem key={t.id} value={t.id}>
										{t.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="clientId">Cliente</Label>
						<Select
							onValueChange={(v) => setClientId(v ?? "")}
							value={clientId}
						>
							<SelectTrigger id="clientId">
								<SelectValue placeholder="Selecione o cliente" />
							</SelectTrigger>
							<SelectContent>
								{clients.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{c.name} — {c.email}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="rating">Nota</Label>
						<Input
							id="rating"
							max={5}
							min={1}
							onChange={(e) => setRating(Number(e.target.value))}
							type="number"
							value={rating}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="title">Título (opcional)</Label>
						<Input
							id="title"
							maxLength={200}
							onChange={(e) => setTitle(e.target.value)}
							value={title}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="body">Corpo</Label>
						<Textarea
							id="body"
							onChange={(e) => setBody(e.target.value)}
							rows={6}
							value={body}
						/>
					</div>

					<div className="space-y-2">
						<Label>Status inicial</Label>
						<RadioGroup
							onValueChange={(v) =>
								setStatus((v ?? "approved") as "pending" | "approved")
							}
							value={status}
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem id="status-approved" value="approved" />
								<Label htmlFor="status-approved">
									Aprovada (publica imediatamente)
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem id="status-pending" value="pending" />
								<Label htmlFor="status-pending">
									Pendente (entra na fila de moderação)
								</Label>
							</div>
						</RadioGroup>
					</div>

					<div className="flex gap-2 pt-2">
						<Button disabled={isPending} type="submit">
							{isPending ? <Spinner /> : "Criar avaliação"}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
