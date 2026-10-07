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
