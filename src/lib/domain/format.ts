import type { BaseSection, Section } from './types';

export function dayLabel(n: number): string {
	return `Day ${String(n).padStart(2, '0')}`;
}

// 'YYYY-MM-DD' → 'MM-DD'
export function monthDay(date: string): string {
	return date.slice(5);
}

const SECTION_LABEL: Record<BaseSection, string> = { class: '숙제 단어', mine: '내 단어' };

// 커스텀 묶음은 그 이름을 쓴다
export function sectionLabel(section: Section, customName?: string | null): string {
	return customName ?? SECTION_LABEL[section as BaseSection];
}
