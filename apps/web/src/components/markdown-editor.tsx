"use client";

import { Button } from "@emach/ui/components/button";
import { cn } from "@emach/ui/lib/utils";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { useEffect } from "react";
import { buildDescriptionExtensions } from "./markdown-editor-extensions";

interface MarkdownEditorProps {
	"aria-invalid"?: boolean | undefined;
	disabled?: boolean;
	id?: string;
	onChange: (markdown: string) => void;
	value: string;
}

export function MarkdownEditor({
	"aria-invalid": ariaInvalid,
	disabled = false,
	id,
	onChange,
	value,
}: MarkdownEditorProps) {
	const editor = useEditor({
		content: value,
		editable: !disabled,
		editorProps: {
			attributes: {
				"aria-multiline": "true",
				class: "min-h-24 px-2.5 py-2 text-xs outline-none",
				role: "textbox",
			},
		},
		extensions: buildDescriptionExtensions(),
		immediatelyRender: false,
		onUpdate: ({ editor: e }) => {
			onChange(e.storage.markdown.getMarkdown());
		},
	});

	// value pode mudar por fora (hydrate do draft de localStorage pós-mount,
	// reset do form) — re-sincronizar sem loop: só quando diverge do estado interno.
	useEffect(() => {
		if (!editor) {
			return;
		}
		const current = editor.storage.markdown.getMarkdown();
		if (value !== current) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	const active = useEditorState({
		editor,
		selector: ({ editor: e }) =>
			e
				? {
						bold: e.isActive("bold"),
						bulletList: e.isActive("bulletList"),
						italic: e.isActive("italic"),
						orderedList: e.isActive("orderedList"),
					}
				: null,
	});

	const controls = [
		{
			action: () => editor?.chain().focus().toggleBold().run(),
			icon: Bold,
			isActive: active?.bold,
			label: "Negrito (Ctrl+B)",
		},
		{
			action: () => editor?.chain().focus().toggleItalic().run(),
			icon: Italic,
			isActive: active?.italic,
			label: "Itálico (Ctrl+I)",
		},
		{
			action: () => editor?.chain().focus().toggleBulletList().run(),
			icon: List,
			isActive: active?.bulletList,
			label: "Lista com marcadores",
		},
		{
			action: () => editor?.chain().focus().toggleOrderedList().run(),
			icon: ListOrdered,
			isActive: active?.orderedList,
			label: "Lista numerada",
		},
	];

	return (
		<div
			aria-invalid={ariaInvalid}
			className={cn(
				"rounded-md border border-input bg-transparent transition-colors focus-within:ring-1 focus-within:ring-ring dark:bg-input/30",
				ariaInvalid &&
					"border-destructive ring-1 ring-destructive/20 dark:border-destructive/50",
				disabled && "cursor-not-allowed opacity-50"
			)}
			id={id}
		>
			<div className="flex items-center gap-0.5 border-border border-b px-1 py-0.5">
				{controls.map((control) => (
					<Button
						aria-label={control.label}
						aria-pressed={control.isActive}
						className={cn(control.isActive && "bg-muted text-foreground")}
						disabled={disabled}
						key={control.label}
						onClick={control.action}
						size="icon-xs"
						title={control.label}
						type="button"
						variant="ghost"
					>
						<control.icon />
					</Button>
				))}
			</div>
			<EditorContent editor={editor} />
		</div>
	);
}
