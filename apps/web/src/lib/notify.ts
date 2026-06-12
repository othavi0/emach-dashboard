import { type ExternalToast, toast } from "sonner";

const ERROR_MS = 8000;
const DEFAULT_MS = 4000;

/**
 * Wrapper do sonner com durações padrão. Erro e warning duram 8s e ganham
 * botão de fechar (toasts longos precisam ser dispensáveis); sucesso e info
 * duram 4s e somem sozinhos. O `closeButton` mora aqui (intenção explícita por
 * tipo), não global no Toaster. Use no lugar de `toast.*`.
 */
export const notify = {
	error: (message: string, opts?: ExternalToast) =>
		toast.error(message, { duration: ERROR_MS, closeButton: true, ...opts }),
	success: (message: string, opts?: ExternalToast) =>
		toast.success(message, { duration: DEFAULT_MS, ...opts }),
	warning: (message: string, opts?: ExternalToast) =>
		toast.warning(message, { duration: ERROR_MS, closeButton: true, ...opts }),
	info: (message: string, opts?: ExternalToast) =>
		toast.info(message, { duration: DEFAULT_MS, ...opts }),
	message: (message: string, opts?: ExternalToast) => toast(message, opts),
};
