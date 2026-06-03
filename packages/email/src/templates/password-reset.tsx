import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	pixelBasedPreset,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

interface PasswordResetEmailProps {
	url: string;
}

export function PasswordResetEmail({ url }: PasswordResetEmailProps) {
	return (
		<Html lang="pt-BR">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: { extend: { colors: { coral: "#cc785c" } } },
				}}
			>
				<Head />
				<Body className="bg-gray-100 font-sans">
					<Preview>Redefinir sua senha no painel E-mach</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Redefinir senha
							</Heading>
							<Text className="text-base text-gray-700">
								Recebemos um pedido para redefinir a senha do painel de gestão.
								Clique no botão abaixo para criar uma nova senha. O link expira
								em 1 hora.
							</Text>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={url}
							>
								Redefinir minha senha
							</Button>
							<Text className="text-gray-500 text-sm">
								Se você não pediu isso, ignore este email — sua senha continua a
								mesma.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

PasswordResetEmail.PreviewProps = {
	url: "https://exemplo.com/redefinir-senha?token=abc123",
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;
