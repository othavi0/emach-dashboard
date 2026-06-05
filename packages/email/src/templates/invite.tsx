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

interface InviteEmailProps {
	acceptUrl: string;
	inviterName: string;
}

export function InviteEmail({ acceptUrl, inviterName }: InviteEmailProps) {
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
					<Preview>Você foi convidado para o painel E-mach</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Você foi convidado
							</Heading>
							<Text className="text-base text-gray-700">
								{inviterName} convidou você para o painel de gestão da E-mach.
								Clique abaixo para criar seu acesso definindo nome e senha. O
								convite expira em 7 dias.
							</Text>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={acceptUrl}
							>
								Criar acesso
							</Button>
							<Text className="text-gray-500 text-sm">
								Se você não esperava este convite, ignore este email.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

InviteEmail.PreviewProps = {
	acceptUrl: "https://exemplo.com/convite?token=abc123",
	inviterName: "Maria Souza",
} satisfies InviteEmailProps;

export default InviteEmail;
