import { describe, expect, it } from 'vitest';
import {
	createSession,
	currentId,
	hide,
	next,
	prev,
	progress,
	type SessionState
} from '$lib/domain/session';
import type { Order, Repeat } from '$lib/domain/types';

// 시드 고정 RNG (mulberry32)
function seeded(seed: number) {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function words(n: number) {
	return Array.from({ length: n }, (_, i) => ({ id: i + 1, english: `w${i + 1}`, meaning: `뜻${i + 1}` }));
}

// 끝날 때까지 next를 불러 지나온 id를 바퀴별로 모은다
function walk(s: SessionState, rng = seeded(1), maxSteps = 100_000) {
	const seen: number[][] = [];
	let state = s;
	for (let step = 0; state.status === 'active' && step < maxSteps; step++) {
		(seen[state.round] ??= []).push(currentId(state)!);
		state = next(state, rng);
	}
	return { seen, state };
}

describe('createSession', () => {
	it('빈 목록이면 empty 상태다', () => {
		const s = createSession([], { order: 'textbook', repeat: 1 });
		expect(s.status).toBe('empty');
		expect(currentId(s)).toBeNull();
		expect(s.firstRoundFinished).toBe(false);
	});

	it('교재순이면 받은 순서 그대로 첫 카드부터 시작한다', () => {
		const s = createSession(words(3), { order: 'textbook', repeat: 1 });
		expect(s.status).toBe('active');
		expect(currentId(s)).toBe(1);
		expect(walk(s).seen).toEqual([[1, 2, 3]]);
	});

	it('알파벳순은 영어 대소문자를 무시하고 정렬하고, 같으면 뜻으로 정렬한다 (R-26)', () => {
		const list = [
			{ id: 1, english: 'lead', meaning: '납, 연필심' },
			{ id: 2, english: 'Garden', meaning: '정원' },
			{ id: 3, english: 'lead', meaning: '이끌다' },
			{ id: 4, english: 'apple', meaning: '사과' }
		];
		const s = createSession(list, { order: 'alpha', repeat: 1 });
		expect(walk(s).seen).toEqual([[4, 2, 1, 3]]);
	});

	it('카드가 1장이면 만들자마자 첫 바퀴를 끝낸 것으로 본다 (R-13)', () => {
		expect(createSession(words(1), { order: 'textbook', repeat: 1 }).firstRoundFinished).toBe(true);
		expect(createSession(words(2), { order: 'textbook', repeat: 1 }).firstRoundFinished).toBe(false);
	});
});

describe('next와 반복 (R-27, R-37)', () => {
	it('반복 2회면 두 바퀴를 돈 뒤 done이 된다', () => {
		const { seen, state } = walk(createSession(words(3), { order: 'textbook', repeat: 2 }));
		expect(seen).toEqual([
			[1, 2, 3],
			[1, 2, 3]
		]);
		expect(state.status).toBe('done');
	});

	it('계속이면 끝나지 않는다', () => {
		const { seen, state } = walk(createSession(words(3), { order: 'textbook', repeat: 'loop' }), seeded(1), 30);
		expect(state.status).toBe('active');
		expect(seen).toHaveLength(10);
	});

	it('랜덤은 바퀴마다 새로 섞는다 (R-30)', () => {
		const rng = seeded(7);
		const { seen } = walk(createSession(words(12), { order: 'random', repeat: 3 }, rng), rng);
		expect(seen).toHaveLength(3);
		expect(seen[0]).not.toEqual(seen[1]);
		expect(seen[1]).not.toEqual(seen[2]);
	});
});

describe('prev (R-31)', () => {
	it('바퀴 안에서는 한 장 앞으로 간다', () => {
		const s = next(createSession(words(3), { order: 'textbook', repeat: 1 }));
		expect(currentId(prev(s))).toBe(1);
	});

	it('첫 바퀴의 첫 카드에서는 움직이지 않는다', () => {
		const s = createSession(words(3), { order: 'textbook', repeat: 1 });
		expect(prev(s)).toEqual(s);
	});

	it('바퀴의 첫 카드에서는 앞 바퀴의 마지막 카드로 가고, 앞 바퀴는 지나온 순서 그대로다', () => {
		const rng = seeded(3);
		let s = createSession(words(8), { order: 'random', repeat: 2 }, rng);
		const firstRound: number[] = [];
		for (let i = 0; i < 8; i++) {
			firstRound.push(currentId(s)!);
			s = next(s, rng);
		}
		expect(s.round).toBe(1);

		s = prev(s);
		const back: number[] = [currentId(s)!];
		for (let i = 0; i < 7; i++) {
			s = prev(s);
			back.unshift(currentId(s)!);
		}
		expect(back).toEqual(firstRound);
	});
});

describe('hide (R-35, R-36)', () => {
	it('현재 카드를 숨기면 같은 자리의 다음 카드가 나오고 장수가 줄어든다', () => {
		let s = createSession(words(4), { order: 'textbook', repeat: 1 });
		s = next(s); // 2
		s = hide(s, 2);
		expect(currentId(s)).toBe(3);
		expect(progress(s)).toMatchObject({ position: 2, total: 3 });
	});

	it('숨긴 카드는 지나온 바퀴와 남은 바퀴 모두에서 빠진다', () => {
		const rng = seeded(5);
		let s = createSession(words(5), { order: 'textbook', repeat: 2 }, rng);
		s = next(s, rng); // 2
		s = hide(s, 2, rng);
		const { seen } = walk(s, rng);
		expect(seen.flat()).not.toContain(2);
		expect(seen[1]).toEqual([1, 3, 4, 5]);
		// 지나온 카드로 돌아가도 숨긴 카드가 없다
		expect(currentId(prev(s))).toBe(1);
	});

	it('현재 위치보다 앞의 카드를 숨기면 위치가 하나 당겨지고 현재 카드는 그대로다', () => {
		let s = createSession(words(4), { order: 'textbook', repeat: 1 });
		s = next(next(s)); // 3
		s = hide(s, 1);
		expect(currentId(s)).toBe(3);
		expect(progress(s)).toMatchObject({ position: 2, total: 3 });
	});

	it('바퀴의 마지막 카드를 숨기면 다음 바퀴 첫 카드로 간다', () => {
		const rng = seeded(1);
		let s = createSession(words(3), { order: 'textbook', repeat: 2 }, rng);
		s = next(next(s, rng), rng); // 3
		s = hide(s, 3, rng);
		expect(s.round).toBe(1);
		expect(currentId(s)).toBe(1);
	});

	it('마지막 바퀴의 마지막 카드를 숨기면 done이다', () => {
		let s = createSession(words(3), { order: 'textbook', repeat: 1 });
		s = next(next(s)); // 3
		s = hide(s, 3);
		expect(s.status).toBe('done');
	});

	it('모든 카드를 숨기면 empty다', () => {
		let s = createSession(words(2), { order: 'textbook', repeat: 'loop' });
		s = hide(s, 1);
		s = hide(s, 2);
		expect(s.status).toBe('empty');
		expect(currentId(s)).toBeNull();
	});
});

describe('firstRoundFinished (R-13)', () => {
	it('첫 바퀴의 마지막 카드가 나오면 참이 되고 이후 유지된다', () => {
		let s = createSession(words(3), { order: 'textbook', repeat: 2 });
		s = next(s);
		expect(s.firstRoundFinished).toBe(false);
		s = next(s); // 첫 바퀴 마지막
		expect(s.firstRoundFinished).toBe(true);
		s = next(s);
		expect(s.firstRoundFinished).toBe(true);
	});

	it('숨기기로 첫 바퀴를 벗어나도 참이 된다', () => {
		let s = createSession(words(3), { order: 'textbook', repeat: 2 });
		s = next(s); // 2
		s = hide(s, 2); // 3, 첫 바퀴 마지막
		expect(s.firstRoundFinished).toBe(true);
	});
});

describe('progress (R-31)', () => {
	it('바퀴 안 위치와 장수, 바퀴 번호를 1부터 센다', () => {
		const s = next(createSession(words(4), { order: 'textbook', repeat: 3 }));
		expect(progress(s)).toEqual({ position: 2, total: 4, round: 1, totalRounds: 3 });
	});

	it('계속이면 전체 바퀴 수가 없다', () => {
		const s = createSession(words(2), { order: 'textbook', repeat: 'loop' });
		expect(progress(s).totalRounds).toBeNull();
	});
});

describe('성질: 모든 바퀴에 모든 카드가 정확히 한 번씩 (S-3)', () => {
	const orders: Order[] = ['textbook', 'random', 'alpha'];
	const rng = seeded(42);

	it('1~150장 무작위 크기에서 순서 3종 × 3회', () => {
		for (let trial = 0; trial < 60; trial++) {
			const n = 1 + Math.floor(rng() * 150);
			for (const order of orders) {
				const { seen, state } = walk(createSession(words(n), { order, repeat: 3 as Repeat }, rng), rng);
				expect(state.status).toBe('done');
				expect(seen).toHaveLength(3);
				for (const round of seen) {
					expect(round).toHaveLength(n);
					expect(new Set(round).size).toBe(n);
				}
			}
		}
	});

	it('7,000장 랜덤 2회', () => {
		const { seen } = walk(createSession(words(7000), { order: 'random', repeat: 2 }, rng), rng);
		for (const round of seen) expect(new Set(round).size).toBe(7000);
	});
});
