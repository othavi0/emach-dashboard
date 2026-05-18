// packages/db/scripts/seed/clients.ts
import { clientAddress, client as clientTable } from "@emach/db/schema/client";
import { clientAuditLog } from "@emach/db/schema/client-audit";
import { clientExportLog } from "@emach/db/schema/client-export";
import { consentLog } from "@emach/db/schema/consent-log";
import type { SeedContext, Tx } from "./context";

// CPFs válidos (11 dígitos, só dígitos)
// CNPJs válidos (14 dígitos, só dígitos)
const CLIENTS = [
	{
		name: "Ana Paula Ferreira",
		email: "ana.ferreira@example.com",
		document: "52998224725", // CPF válido
		clientType: "b2c" as const,
		status: "active" as const,
		phone: "+5511999990001",
	},
	{
		name: "Carlos Eduardo Mota",
		email: "carlos.mota@example.com",
		document: "11144477735", // CPF válido
		clientType: "b2c" as const,
		status: "active" as const,
		phone: "+5511999990002",
	},
	{
		name: "Fernanda Lima",
		email: "fernanda.lima@example.com",
		document: "48567895030", // CPF válido
		clientType: "b2c" as const,
		status: "inactive" as const,
		phone: "+5511999990003",
	},
	{
		name: "Marcos Aurélio Santos",
		email: "marcos.santos@example.com",
		document: "53162050028", // CPF válido
		clientType: "b2c" as const,
		status: "active" as const,
		phone: "+5519999990004",
	},
	{
		name: "Juliana Costa",
		email: "juliana.costa@example.com",
		document: "54271113460", // CPF válido
		clientType: "b2c" as const,
		status: "blocked" as const,
		phone: "+5511999990005",
	},
	{
		name: "Roberto Alves",
		email: "roberto.alves@example.com",
		document: "66987701503", // CPF válido
		clientType: "b2c" as const,
		status: "active" as const,
		phone: "+5511999990006",
	},
	{
		name: "Patricia Nascimento",
		email: "patricia.nascimento@example.com",
		document: null,
		clientType: null,
		status: "active" as const,
		phone: "+5521999990007",
	},
	{
		name: "Construções Rápidas Ltda",
		email: "contato@construcoesrapidas.com.br",
		document: "11222333000181", // CNPJ válido
		clientType: "b2b" as const,
		status: "active" as const,
		phone: "+551133330008",
	},
	{
		name: "Ferramental Industriel S.A.",
		email: "compras@ferramentalindustriel.com.br",
		document: "45678912000167", // CNPJ válido
		clientType: "b2b" as const,
		status: "active" as const,
		phone: "+551133330009",
	},
	{
		name: "Oficina do João ME",
		email: "joao@oficinadojoao.com.br",
		document: "98765432000155", // CNPJ válido
		clientType: "b2b" as const,
		status: "inactive" as const,
		phone: "+551133330010",
	},
	{
		name: "Leandro Barbosa",
		email: "leandro.barbosa@example.com",
		document: "33527801187", // CPF válido
		clientType: "b2c" as const,
		status: "active" as const,
		phone: "+5511999990011",
	},
	{
		name: "Equipamentos Gerais Eireli",
		email: "contato@equipamentosgerais.com.br",
		document: "12345678000195", // CNPJ válido
		clientType: "b2b" as const,
		status: "active" as const,
		phone: "+551133330012",
	},
] as const;

const ADDRESSES: Array<{
	clientEmail: string;
	label?: string;
	recipient: string;
	zipCode: string;
	street: string;
	number: string;
	complement?: string;
	neighborhood: string;
	city: string;
	state: string;
	isDefault: boolean;
}> = [
	// Ana Paula — 2 endereços
	{
		clientEmail: "ana.ferreira@example.com",
		label: "Casa",
		recipient: "Ana Paula Ferreira",
		zipCode: "01310100",
		street: "Av. Paulista",
		number: "1000",
		complement: "Apto 42",
		neighborhood: "Bela Vista",
		city: "São Paulo",
		state: "SP",
		isDefault: true,
	},
	{
		clientEmail: "ana.ferreira@example.com",
		label: "Trabalho",
		recipient: "Ana Paula Ferreira",
		zipCode: "01414001",
		street: "Rua da Consolação",
		number: "250",
		neighborhood: "Consolação",
		city: "São Paulo",
		state: "SP",
		isDefault: false,
	},
	// Carlos — 1 endereço
	{
		clientEmail: "carlos.mota@example.com",
		recipient: "Carlos Eduardo Mota",
		zipCode: "13010110",
		street: "Rua Barão de Jaguara",
		number: "500",
		neighborhood: "Centro",
		city: "Campinas",
		state: "SP",
		isDefault: true,
	},
	// Fernanda — 1 endereço
	{
		clientEmail: "fernanda.lima@example.com",
		recipient: "Fernanda Lima",
		zipCode: "04552000",
		street: "Av. Brigadeiro Faria Lima",
		number: "3477",
		neighborhood: "Itaim Bibi",
		city: "São Paulo",
		state: "SP",
		isDefault: true,
	},
	// Marcos — 1 endereço
	{
		clientEmail: "marcos.santos@example.com",
		recipient: "Marcos Aurélio Santos",
		zipCode: "14020020",
		street: "Av. João Fiúsa",
		number: "100",
		neighborhood: "Jardim Irajá",
		city: "Ribeirão Preto",
		state: "SP",
		isDefault: true,
	},
	// Juliana — 1 endereço
	{
		clientEmail: "juliana.costa@example.com",
		recipient: "Juliana Costa",
		zipCode: "01001000",
		street: "Praça da Sé",
		number: "1",
		neighborhood: "Sé",
		city: "São Paulo",
		state: "SP",
		isDefault: true,
	},
	// Roberto — 2 endereços
	{
		clientEmail: "roberto.alves@example.com",
		label: "Residência",
		recipient: "Roberto Alves",
		zipCode: "04101300",
		street: "Rua Vergueiro",
		number: "2200",
		neighborhood: "Saúde",
		city: "São Paulo",
		state: "SP",
		isDefault: true,
	},
	{
		clientEmail: "roberto.alves@example.com",
		label: "Depósito",
		recipient: "Roberto Alves",
		zipCode: "09550001",
		street: "Av. Industrial",
		number: "345",
		neighborhood: "Centro",
		city: "São Bernardo do Campo",
		state: "SP",
		isDefault: false,
	},
	// Patricia — 1 endereço
	{
		clientEmail: "patricia.nascimento@example.com",
		recipient: "Patricia Nascimento",
		zipCode: "20040020",
		street: "Av. Rio Branco",
		number: "85",
		neighborhood: "Centro",
		city: "Rio de Janeiro",
		state: "RJ",
		isDefault: true,
	},
	// Construções Rápidas — 1 endereço
	{
		clientEmail: "contato@construcoesrapidas.com.br",
		label: "Sede",
		recipient: "Construções Rápidas Ltda",
		zipCode: "06220120",
		street: "Av. das Nações Unidas",
		number: "12000",
		neighborhood: "Bairro Jardim Europa",
		city: "Osasco",
		state: "SP",
		isDefault: true,
	},
	// Ferramental Industriel — 2 endereços
	{
		clientEmail: "compras@ferramentalindustriel.com.br",
		label: "Sede Administrativa",
		recipient: "Ferramental Industriel S.A.",
		zipCode: "09941001",
		street: "Rua das Indústrias",
		number: "1",
		neighborhood: "Distrito Industrial",
		city: "Diadema",
		state: "SP",
		isDefault: true,
	},
	{
		clientEmail: "compras@ferramentalindustriel.com.br",
		label: "Galpão",
		recipient: "Ferramental Industriel S.A.",
		zipCode: "09941050",
		street: "Rua das Indústrias",
		number: "50",
		neighborhood: "Distrito Industrial",
		city: "Diadema",
		state: "SP",
		isDefault: false,
	},
	// Oficina do João — 1 endereço
	{
		clientEmail: "joao@oficinadojoao.com.br",
		recipient: "Oficina do João ME",
		zipCode: "30112010",
		street: "Av. Augusto de Lima",
		number: "788",
		neighborhood: "Centro",
		city: "Belo Horizonte",
		state: "MG",
		isDefault: true,
	},
	// Leandro — 1 endereço
	{
		clientEmail: "leandro.barbosa@example.com",
		recipient: "Leandro Barbosa",
		zipCode: "05423010",
		street: "Rua Cardeal Arcoverde",
		number: "300",
		neighborhood: "Pinheiros",
		city: "São Paulo",
		state: "SP",
		isDefault: true,
	},
	// Equipamentos Gerais — 1 endereço
	{
		clientEmail: "contato@equipamentosgerais.com.br",
		label: "Escritório",
		recipient: "Equipamentos Gerais Eireli",
		zipCode: "13060904",
		street: "Av. José de Souza Campos",
		number: "900",
		neighborhood: "Nova Campinas",
		city: "Campinas",
		state: "SP",
		isDefault: true,
	},
];

export async function seedClients(tx: Tx, ctx: SeedContext): Promise<void> {
	// 1. Inserir clients e mapear email → id
	const emailToId: Record<string, string> = {};

	for (const c of CLIENTS) {
		const id = crypto.randomUUID();
		await tx.insert(clientTable).values({
			id,
			name: c.name,
			email: c.email,
			emailVerified: false,
			document: c.document,
			clientType: c.clientType,
			status: c.status,
			phone: c.phone,
		});
		ctx.clientIds.push(id);
		emailToId[c.email] = id;
	}

	// 2. Inserir endereços
	for (const addr of ADDRESSES) {
		const clientId = emailToId[addr.clientEmail];
		if (!clientId) {
			continue;
		}
		await tx.insert(clientAddress).values({
			id: crypto.randomUUID(),
			clientId,
			label: addr.label ?? null,
			recipient: addr.recipient,
			zipCode: addr.zipCode,
			street: addr.street,
			number: addr.number,
			complement: addr.complement ?? null,
			neighborhood: addr.neighborhood,
			city: addr.city,
			state: addr.state,
			country: "BR",
			isDefault: addr.isDefault,
		});
	}

	// 3. Inserir consent_log — tos + privacy para todos; marketing_email para metade
	for (let i = 0; i < ctx.clientIds.length; i++) {
		const clientId = ctx.clientIds[i];
		if (!clientId) {
			continue;
		}

		// tos
		await tx.insert(consentLog).values({
			id: crypto.randomUUID(),
			clientId,
			kind: "tos",
			granted: true,
			version: "1.0",
		});

		// privacy
		await tx.insert(consentLog).values({
			id: crypto.randomUUID(),
			clientId,
			kind: "privacy",
			granted: true,
			version: "1.0",
		});

		// marketing_email — metade dos clientes (índices pares)
		if (i % 2 === 0) {
			await tx.insert(consentLog).values({
				id: crypto.randomUUID(),
				clientId,
				kind: "marketing_email",
				granted: true,
				version: "1.0",
			});
		}
	}

	// 4. Inserir client_audit_log (~4 entradas)
	const auditEntries: Array<{
		clientEmail: string;
		action: "profile_updated" | "status_changed" | "notes_updated" | "exported";
		staffIndex: number;
	}> = [
		{
			clientEmail: "juliana.costa@example.com",
			action: "status_changed",
			staffIndex: 0,
		},
		{
			clientEmail: "fernanda.lima@example.com",
			action: "status_changed",
			staffIndex: 0,
		},
		{
			clientEmail: "carlos.mota@example.com",
			action: "profile_updated",
			staffIndex: 0,
		},
		{
			clientEmail: "joao@oficinadojoao.com.br",
			action: "notes_updated",
			staffIndex: 0,
		},
	];

	for (const entry of auditEntries) {
		const clientId = emailToId[entry.clientEmail];
		const actorUserId =
			ctx.staffUserIds[entry.staffIndex % ctx.staffUserIds.length];
		if (!(clientId && actorUserId)) {
			continue;
		}

		await tx.insert(clientAuditLog).values({
			id: crypto.randomUUID(),
			clientId,
			actorType: "user",
			actorUserId,
			action: entry.action,
		});
	}

	// 5. Inserir client_export_log (2 entradas)
	const staffId0 = ctx.staffUserIds[0];
	const staffId1 = ctx.staffUserIds[Math.min(1, ctx.staffUserIds.length - 1)];
	if (staffId0) {
		await tx.insert(clientExportLog).values({
			id: crypto.randomUUID(),
			userId: staffId0,
			filters: { status: "active", clientType: "b2c" },
			rowCount: 7,
			bytesWritten: 2048,
			truncated: false,
		});
	}
	if (staffId1 && staffId1 !== staffId0) {
		await tx.insert(clientExportLog).values({
			id: crypto.randomUUID(),
			userId: staffId1,
			filters: { status: "active" },
			rowCount: 10,
			bytesWritten: 3512,
			truncated: false,
		});
	} else if (staffId0) {
		// Só 1 staff: segunda exportação com filtro diferente
		await tx.insert(clientExportLog).values({
			id: crypto.randomUUID(),
			userId: staffId0,
			filters: { clientType: "b2b" },
			rowCount: 4,
			bytesWritten: 1024,
			truncated: false,
		});
	}
}
