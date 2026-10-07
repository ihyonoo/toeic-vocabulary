// 학습 진행 상태 기계 (R-25~R-37)
// 모든 함수는 새 상태를 돌려준다
import type { Order, Repeat } from './types';

export type SessionState = {
	order: Order;
	repeat: Repeat;
	// 정렬된 단어 id
	// 숨기면 빠진다
	base: number[];
	// 만들어진 바퀴들
	// 이전 이동이 지나온 순서를 따르도록 보관한다
	rounds: number[][];
	round: number;
	index: number;
	status: 'active' | 'done' | 'empty';
	firstRoundFinished: boolean;
};

export type Rng = () => number;

type SessionWord = { id: number; english: string; meaning: string };

function shuffle(ids: number[], rng: Rng): number[] {
	const out = [...ids];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

function makeRound(s: Pick<SessionState, 'order' | 'base'>, rng: Rng): number[] {
	return s.order === 'random' ? shuffle(s.base, rng) : [...s.base];
}

function sortBase(words: SessionWord[], order: Order): number[] {
	if (order !== 'alpha') return words.map((w) => w.id);
	return [...words]
		.sort(
			(a, b) =>
				a.english.localeCompare(b.english, 'en', { sensitivity: 'base' }) ||
				a.meaning.localeCompare(b.meaning, 'ko')
		)
		.map((w) => w.id);
}

function hasMoreRounds(s: SessionState): boolean {
	return s.repeat === 'loop' || s.round + 1 < s.repeat;
}

function withFirstRound(s: SessionState): SessionState {
	if (s.firstRoundFinished) return s;
	const finished =
		s.round > 0 ||
		s.status !== 'active' ||
		(s.round === 0 && s.index === s.rounds[0].length - 1);
	return finished ? { ...s, firstRoundFinished: true } : s;
}

export function createSession(
	words: SessionWord[],
	opts: { order: Order; repeat: Repeat },
	rng: Rng = Math.random
): SessionState {
	const base = sortBase(words, opts.order);
	if (base.length === 0) {
		return { ...opts, base, rounds: [], round: 0, index: 0, status: 'empty', firstRoundFinished: false };
	}
	const s: SessionState = {
		...opts,
		base,
		rounds: [makeRound({ order: opts.order, base }, rng)],
		round: 0,
		index: 0,
		status: 'active',
		firstRoundFinished: false
	};
	return withFirstRound(s);
}

// 현재 바퀴를 벗어날 때: 다음 바퀴로 가거나 끝낸다
function advanceRound(s: SessionState, rng: Rng): SessionState {
	if (!hasMoreRounds(s)) return withFirstRound({ ...s, status: 'done' });
	const round = s.round + 1;
	const rounds = round < s.rounds.length ? s.rounds : [...s.rounds, makeRound(s, rng)];
	return withFirstRound({ ...s, rounds, round, index: 0 });
}

export function next(s: SessionState, rng: Rng = Math.random): SessionState {
	if (s.status !== 'active') return s;
	if (s.index < s.rounds[s.round].length - 1) return withFirstRound({ ...s, index: s.index + 1 });
	return advanceRound(s, rng);
}

export function prev(s: SessionState): SessionState {
	if (s.status !== 'active') return s;
	if (s.index > 0) return { ...s, index: s.index - 1 };
	if (s.round === 0) return s;
	const round = s.round - 1;
	return { ...s, round, index: s.rounds[round].length - 1 };
}

export function hide(s: SessionState, wordId: number, rng: Rng = Math.random): SessionState {
	if (s.status === 'empty') return s;
	const current = s.rounds[s.round];
	const removedAt = current.indexOf(wordId);
	const base = s.base.filter((id) => id !== wordId);
	const rounds = s.rounds.map((r) => r.filter((id) => id !== wordId));

	if (base.length === 0) {
		return withFirstRound({ ...s, base, rounds, status: 'empty' });
	}
	if (s.status !== 'active') return { ...s, base, rounds };

	const index = removedAt !== -1 && removedAt < s.index ? s.index - 1 : s.index;
	const updated = { ...s, base, rounds, index };
	if (index < rounds[s.round].length) return withFirstRound(updated);
	// 바퀴의 마지막 카드를 숨겼다
	return advanceRound({ ...updated, index: rounds[s.round].length - 1 }, rng);
}

export function currentId(s: SessionState): number | null {
	return s.status === 'active' ? s.rounds[s.round][s.index] : null;
}

export function progress(s: SessionState) {
	return {
		position: s.index + 1,
		total: s.rounds[s.round]?.length ?? 0,
		round: s.round + 1,
		totalRounds: s.repeat === 'loop' ? null : s.repeat
	};
}
