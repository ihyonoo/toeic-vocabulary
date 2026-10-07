import type { Word } from '$lib/domain/types';
import { api } from './api';

type Flag = 'bookmarked' | 'hidden';
type Slot = { queue: Promise<void>; pending: number; confirmed: boolean; latest: number };

const slots = new Map<string, Slot>();

// 같은 단어·칸의 요청을 줄 세워 보내 서버가 누른 순서대로 반영하게 한다
// 실패하면 그 요청이 마지막일 때만 서버가 마지막으로 확인한 값으로 되돌린다
export function toggleFlag(word: Word, key: Flag, onError: () => void) {
	const id = `${word.id}:${key}`;
	let slot = slots.get(id);
	if (!slot || slot.pending === 0) {
		slot = { queue: Promise.resolve(), pending: 0, confirmed: word[key], latest: 0 };
		slots.set(id, slot);
	}
	const s = slot;
	const value = !word[key];
	const seq = ++s.latest;
	word[key] = value;
	s.pending += 1;
	s.queue = s.queue.then(async () => {
		try {
			await api.patchWord(word.id, { [key]: value });
			s.confirmed = value;
		} catch {
			if (s.latest === seq) {
				word[key] = s.confirmed;
				onError();
			}
		} finally {
			s.pending -= 1;
		}
	});
}
