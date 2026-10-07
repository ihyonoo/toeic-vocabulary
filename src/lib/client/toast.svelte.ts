export const toast = $state<{ message: string | null }>({ message: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string) {
	toast.message = message;
	clearTimeout(timer);
	timer = setTimeout(() => (toast.message = null), 3000);
}
