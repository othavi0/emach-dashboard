import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import Link from "next/link";

export function ForgotPasswordForm() {
	return (
		<div>
			<h1 className="font-medium font-serif text-3xl tracking-tight">
				Recuperar acesso
			</h1>
			<p className="mt-1 text-muted-foreground text-sm">
				Enviaremos um link de redefinição para o seu email.
			</p>

			<form className="mt-6 flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<Label htmlFor="email">Email</Label>
					<Input
						autoComplete="email"
						disabled
						id="email"
						name="email"
						placeholder="voce@emach.com.br"
						type="email"
					/>
				</div>
				<Button disabled type="button">
					Enviar link
				</Button>
				<p className="text-center text-muted-foreground text-xs">
					Disponível em breve.
				</p>
			</form>

			<Link
				className="mt-4 block text-center text-muted-foreground text-sm hover:text-foreground"
				href="/login"
			>
				← Voltar para o login
			</Link>
		</div>
	);
}
