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

interface VerifyNewEmailProps {
	url: string;
}

export function VerifyNewEmail({ url }: VerifyNewEmailProps) {
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
					<Preview>Verifique seu novo e-mail no painel E-mach</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Verifique seu novo e-mail
							</Heading>
							<Text className="text-base text-gray-700">
								Confirme este novo endereço de e-mail para concluir a troca no
								painel de gestão. Clique no botão abaixo. O link expira em 1
								hora.
							</Text>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={url}
							>
								Verificar novo e-mail
							</Button>
							<Text className="text-gray-500 text-sm">
								Se você não reconhece esta solicitação, ignore este email.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

VerifyNewEmail.PreviewProps = {
	url: "https://exemplo.com/verify-email?token=abc123",
} satisfies VerifyNewEmailProps;

export default VerifyNewEmail;
