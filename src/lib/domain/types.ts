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
