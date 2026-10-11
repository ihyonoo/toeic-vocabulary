// R-2 같은 단어 판정 규칙

function collapseSpaces(s: string): string {
	return s.replace(/\s+/g, ' ');
}

export function normalizeEnglish(s: string): string {
	return collapseSpaces(s).trim();
}

export function englishKey(s: string): string {
	return normalizeEnglish(s).toLowerCase();
}

// 순서: 연속 공백 → 구분자 주변 공백 → 앞뒤 공백
export function normalizeMeaning(s: string): string {
	return collapseSpaces(s)
		.replace(/\s*([,;])\s*/g, '$1 ')
		.trim();
}

// 커스텀 묶음 이름 (docs/design/2026-10-11-custom-sections.md)
export const CUSTOM_NAME_MAX = 12;
export const CUSTOM_NAME_RULE = `묶음 이름은 1~${CUSTOM_NAME_MAX}자로 써 주세요. 숙제 단어·내 단어·숨긴 단어는 쓸 수 없어요.`;
const RESERVED_NAMES = ['숙제 단어', '내 단어', '숨긴 단어'];

// 쓸 수 없는 이름이면 null
export function cleanCustomName(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const name = normalizeEnglish(value);
	if (name.length < 1 || name.length > CUSTOM_NAME_MAX || RESERVED_NAMES.includes(name)) return null;
	return name;
}
