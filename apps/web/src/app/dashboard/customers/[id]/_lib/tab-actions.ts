"use server";

import type { ClientAuditAction } from "@emach/db/schema/client-audit";

import { requireCapability } from "@/lib/permissions";
import type {
	CustomerAddressRow,
	CustomerAuditRow,
	CustomerConsentByKind,
	CustomerReviewRow,
	CustomerSessionRow,
} from "../../data";
import {
	getCustomerAddresses,
	getCustomerAudit,
	getCustomerConsent,
	getCustomerReviews,
	getCustomerSessions,
} from "../../data";
import { auditFilterSchema } from "../../schema";

export async function fetchCustomerAddressesTabAction(
	clientId: string
): Promise<CustomerAddressRow[]> {
	// Mesma capability que hoje gate o acesso à página de detalhe do cliente.
	await requireCapability("customers.read");
	return await getCustomerAddresses(clientId);
}

export async function fetchCustomerReviewsTabAction(
	clientId: string
): Promise<CustomerReviewRow[]> {
	await requireCapability("customers.read");
	return await getCustomerReviews(clientId);
}

export async function fetchCustomerConsentTabAction(
	clientId: string
): Promise<CustomerConsentByKind> {
	await requireCapability("customers.read");
	return await getCustomerConsent(clientId);
}

export async function fetchCustomerSessionsTabAction(
	clientId: string
): Promise<CustomerSessionRow[]> {
	await requireCapability("customers.read");
	return await getCustomerSessions(clientId);
}

export async function fetchCustomerAuditTabAction(
	clientId: string,
	action?: string
): Promise<CustomerAuditRow[]> {
	await requireCapability("customers.read");
	// Mesma validação que hoje o page.tsx aplicava no searchParam ?auditAction.
	const parsed = auditFilterSchema.safeParse({ action });
	const validAction: ClientAuditAction | undefined = parsed.success
		? parsed.data.action
		: undefined;
	return await getCustomerAudit(clientId, { action: validAction });
}
