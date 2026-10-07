export type Word = {
	id: number;
	english: string;
	meaning: string;
	pos: string;
	example: string;
	exampleKo: string;
	bookmarked: boolean;
	hidden: boolean;
};

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

export type ImportInput = { day: number; words: ImportItem[] };

export type ImportResult = {
	day: number;
	created: WordRef[];
	linked: WordRef[];
	skipped: WordRef[];
};

export type WordPatch = Partial<
	Pick<Word, 'english' | 'meaning' | 'pos' | 'example' | 'exampleKo' | 'bookmarked' | 'hidden'>
>;

export type Order = 'textbook' | 'random' | 'alpha';
export type Repeat = 1 | 2 | 3 | 'loop';
export type ViewMode = 'both' | 'english' | 'meaning';
export type StudyScope = 'day' | 'all' | 'bookmarks';
