import type { Order, Repeat, ViewMode } from '$lib/domain/types';

const VIEW_KEY = 'vocab.viewMode';
const MODES: ViewMode[] = ['both', 'english', 'meaning'];

export const VIEW_MODE_LABEL: Record<ViewMode, string> = {
	both: '영어/뜻 보기',
	english: '영어만 보기',
	meaning: '뜻만 보기'
};

// 개인 브라우저나 저장소 차단 환경에서는 접근 자체가 예외를 던진다
function read(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function write(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// 저장 실패 시 기본값으로 동작
	}
}

function initialViewMode(): ViewMode {
	const saved = read(VIEW_KEY);
	return MODES.includes(saved as ViewMode) ? (saved as ViewMode) : 'both';
}

export const prefs = $state<{ viewMode: ViewMode }>({ viewMode: initialViewMode() });

export function cycleViewMode() {
	prefs.viewMode = MODES[(MODES.indexOf(prefs.viewMode) + 1) % MODES.length];
	write(VIEW_KEY, prefs.viewMode);
}

export function isEnglishMasked(mode: ViewMode): boolean {
	return mode === 'meaning';
}

export function isMeaningMasked(mode: ViewMode): boolean {
	return mode === 'english';
}

export type StudyPrefs = { order: Order; repeat: Repeat };

const STUDY_KEY = 'vocab.studyPrefs';
const ORDERS: Order[] = ['textbook', 'random', 'alpha'];
const REPEATS: Repeat[] = [1, 2, 3, 'loop'];

// 처음에는 교재순·1회 (R-28), 이후에는 마지막 선택 (R-29)
export function loadStudyPrefs(): StudyPrefs {
	try {
		const saved = JSON.parse(read(STUDY_KEY) ?? '{}');
		if (ORDERS.includes(saved.order) && REPEATS.includes(saved.repeat)) return saved;
	} catch {
		// 깨진 값이면 기본값
	}
	return { order: 'textbook', repeat: 1 };
}

export function saveStudyPrefs(value: StudyPrefs) {
	write(STUDY_KEY, JSON.stringify(value));
}
