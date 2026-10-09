// class: 학원이 나눠 준 종이 단어
// mine: 사용자가 정리한 단어
export type Section = 'class' | 'mine';
export type StudyGroup = 'all' | Section;

export type Word = {
	id: number;
	english: string;
	meaning: string;
	pos: string;
	example: string;
	exampleKo: string;
	bookmarked: boolean;
	hidden: boolean;
	// 지금 속한 묶음들, ['class', 'mine'] 순서
	sections: Section[];
};

// 그 Day에서의 묶음
export type DayWord = Word & { section: Section };

export type DaySummary = {
	number: number;
	// day_words 행 수, 숨긴 단어 포함
	wordCount: number;
	studyCount: number;
	// 'YYYY-MM-DD', 서울 시간
	lastStudiedOn: string | null;
};

export type WordRef = { id: number; english: string; meaning: string };

export type ImportItem = {
	english: string;
	meaning: string;
	pos?: string;
	example?: string;
	exampleKo?: string;
};

export type ImportInput = { day: number; section?: Section; words: ImportItem[] };

export type ImportResult = {
	day: number;
	created: WordRef[];
	linked: WordRef[];
	skipped: WordRef[];
	// 같은 Day의 내 단어였다가 종이 등록으로 수업 단어가 된 것
	moved: WordRef[];
};

export type WordPatch = Partial<
	Pick<Word, 'english' | 'meaning' | 'pos' | 'example' | 'exampleKo' | 'bookmarked' | 'hidden'>
>;

export type Order = 'textbook' | 'random' | 'alpha';
export type Repeat = 1 | 2 | 3 | 'loop';
export type ViewMode = 'both' | 'english' | 'meaning';
export type StudyScope = 'day' | 'all' | 'bookmarks';

// 사진 등록 초안 (docs/trd/2026-10-09-photo-import.md)
export type DraftStatus = 'processing' | 'ready' | 'failed';

export type DraftItem = {
	english: string;
	meaning: string;
	pos: string;
	example: string;
	exampleKo: string;
	// AI가 철자를 고쳤을 때 종이의 철자, 아니면 null
	paperEnglish: string | null;
	// 종이에 뜻이 없어 AI가 채웠는가
	meaningFilled: boolean;
};

export type DraftSummary = {
	id: number;
	day: number;
	section: Section;
	status: DraftStatus;
	itemCount: number;
	// failed일 때 사용자에게 보일 이유
	error: string | null;
	createdAt: string;
};

export type Draft = DraftSummary & { items: DraftItem[] };

export type DraftInput = { day: number; section: Section; items: DraftItem[] };
