export default function PendingLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<main className="flex min-h-screen flex-1 items-center justify-center px-6 py-12">
			{children}
		</main>
	);
}
