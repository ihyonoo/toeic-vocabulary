export function dayLabel(n: number): string {
	return `Day ${String(n).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' → 'MM-DD'
export function monthDay(date: string): string {
	return date.slice(5);
}

const SECTION_LABEL = { class: '수업 단어', mine: '내 단어' } as const;

export function sectionLabel(section: keyof typeof SECTION_LABEL): string {
	return SECTION_LABEL[section];
}
