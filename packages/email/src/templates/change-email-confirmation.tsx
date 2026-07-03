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

interface ChangeEmailConfirmationProps {
	url: string;
}

export function ChangeEmailConfirmation({ url }: ChangeEmailConfirmationProps) {
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
					<Preview>Confirme a troca de e-mail do painel E-mach</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Troca de e-mail solicitada
							</Heading>
							<Text className="text-base text-gray-700">
								Alguém solicitou a troca do e-mail desta conta no painel de
								gestão. Se foi você, clique no botão abaixo para confirmar. O
								link expira em 1 hora.
							</Text>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={url}
							>
								Confirmar troca de e-mail
							</Button>
							<Text className="text-gray-500 text-sm">
								Se você não pediu isso, ignore este email — seu e-mail continua
								o mesmo.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

ChangeEmailConfirmation.PreviewProps = {
	url: "https://exemplo.com/verify-email?token=abc123",
} satisfies ChangeEmailConfirmationProps;

export default ChangeEmailConfirmation;
