"use client";

import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

import type { PickingQueueCounts } from "../data";

export type SeparacaoTab =
	| "a_separar"
	| "em_separacao"
	| "excecoes"
	| "produtividade";

const BASE = "/dashboard/separacao";

/**
 * Barra de tabs da Separação, compartilhada entre a fila (PickingQueue) e a
 * tab Produtividade. Split: fluxo do operador à esquerda; exceções/análise à
 * direita. Produtividade não tem badge (não é fila). A ação "Selecionar"
 * mora no PageHeader (PickingQueue), espelhando orders-view — não é mais
 * slot desta barra.
 */
export function SeparacaoTabs({
	activeTab,
	counts,
}: {
	activeTab: SeparacaoTab;
	counts: PickingQueueCounts;
}) {
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
			<Tabs value={activeTab}>
				<TabsList scrollable>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={`${BASE}?tab=a_separar`} />}
						value="a_separar"
					>
						A separar
						<TabsCountBadge value={counts.a_separar} />
					</TabsTrigger>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={`${BASE}?tab=em_separacao`} />}
						value="em_separacao"
					>
						Separando
						<TabsCountBadge value={counts.em_separacao} />
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<Tabs value={activeTab}>
				<TabsList>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={`${BASE}?tab=excecoes`} />}
						value="excecoes"
					>
						Exceções
						<TabsCountBadge value={counts.excecoes} />
					</TabsTrigger>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={`${BASE}?tab=produtividade`} />}
						value="produtividade"
					>
						Produtividade
					</TabsTrigger>
				</TabsList>
			</Tabs>
		</div>
	);
}
