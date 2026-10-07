export function dayLabel(n: number): string {
	return `Day ${String(n).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' → 'MM-DD'
export function monthDay(date: string): string {
	return date.slice(5);
}
