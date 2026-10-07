import type { Order, Repeat, StudyGroup, ViewMode } from '$lib/domain/types';

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

export type StudyPrefs = { order: Order; repeat: Repeat; group: StudyGroup };

const STUDY_KEY = 'vocab.studyPrefs';
const ORDERS: Order[] = ['textbook', 'random', 'alpha'];
const REPEATS: Repeat[] = [1, 2, 3, 'loop'];
const GROUPS: StudyGroup[] = ['all', 'class', 'mine'];

// 처음에는 교재순·1회·둘 다 (R-28), 이후에는 마지막 선택 (R-29)
// 칸마다 따로 검사해 예전에 저장한 값(group 없음)도 순서·반복은 살린다
export function loadStudyPrefs(): StudyPrefs {
	let saved: Partial<StudyPrefs> = {};
	try {
		saved = JSON.parse(read(STUDY_KEY) ?? '{}') ?? {};
	} catch {
		// 깨진 값이면 기본값
	}
	return {
		order: ORDERS.includes(saved.order as Order) ? (saved.order as Order) : 'textbook',
		repeat: REPEATS.includes(saved.repeat as Repeat) ? (saved.repeat as Repeat) : 1,
		group: GROUPS.includes(saved.group as StudyGroup) ? (saved.group as StudyGroup) : 'all'
	};
}

export function saveStudyPrefs(value: StudyPrefs) {
	write(STUDY_KEY, JSON.stringify(value));
}
