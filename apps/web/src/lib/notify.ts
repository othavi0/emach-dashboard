import { type ExternalToast, toast } from "sonner";

const ERROR_MS = 8000;
const DEFAULT_MS = 4000;

/**
 * Wrapper do sonner com durações padrão: erro 8s (+ botão fechar), demais 4s.
 * Use no lugar de `toast.*` para que erros fiquem visíveis o suficiente.
 */
export const notify = {
	error: (message: string, opts?: ExternalToast) =>
		toast.error(message, { duration: ERROR_MS, closeButton: true, ...opts }),
	success: (message: string, opts?: ExternalToast) =>
		toast.success(message, { duration: DEFAULT_MS, ...opts }),
	warning: (message: string, opts?: ExternalToast) =>
		toast.warning(message, { duration: ERROR_MS, ...opts }),
	info: (message: string, opts?: ExternalToast) =>
		toast.info(message, { duration: DEFAULT_MS, ...opts }),
	message: (message: string, opts?: ExternalToast) => toast(message, opts),
};
