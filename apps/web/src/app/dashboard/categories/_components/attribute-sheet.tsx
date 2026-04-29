"use client";

import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";

import type { AttributeFormValues } from "../_lib/attribute-schema";
import { AttributeForm } from "./attribute-form";

export type AttributeSheetMode =
	| { kind: "create" }
	| {
			kind: "edit";
			attributeId: string;
			defaultValues: Partial<AttributeFormValues>;
	  };

interface AttributeSheetProps {
	categoryId: string;
	categoryName: string;
	mode: AttributeSheetMode | null;
	onClose: () => void;
}

export function AttributeSheet({
	categoryId,
	categoryName,
	mode,
	onClose,
}: AttributeSheetProps) {
	const open = mode !== null;
	return (
		<Sheet
			onOpenChange={(next) => {
				if (!next) {
					onClose();
				}
			}}
			open={open}
		>
			<SheetContent
				className="flex w-full flex-col gap-0 sm:max-w-md"
				side="right"
			>
				<SheetHeader>
					<SheetTitle>
						{mode?.kind === "edit" ? "Editar atributo" : "Novo atributo"}
					</SheetTitle>
					<SheetDescription>
						Categoria:{" "}
						<strong className="text-foreground">{categoryName}</strong>
					</SheetDescription>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto p-4">
					{mode && (
						<AttributeForm
							attributeId={mode.kind === "edit" ? mode.attributeId : undefined}
							categoryId={categoryId}
							defaultValues={mode.kind === "edit" ? mode.defaultValues : {}}
							mode={mode.kind}
							onSuccess={onClose}
						/>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
