// 비밀번호 확인 실패를 IP마다 센다 (docs/design/2026-10-10-devserver-deploy.md)
// 한 프로세스라 메모리에 둔다
// 재시작하면 기록이 사라진다
type Entry = { count: number; start: number; until: number };

type Limiter = {
	blocked(key: string, now?: number): boolean;
	fail(key: string, now?: number): void;
	reset(key: string): void;
};

// windowMs 안에 max번 틀리면 마지막 실패부터 windowMs 동안 막는다
export function createLimiter({ max, windowMs }: { max: number; windowMs: number }): Limiter {
	const entries = new Map<string, Entry>();
	let prunedAt = -Infinity;

	// 실패마다 전체를 돌면 IP가 많을 때 비용이 제곱으로 는다
	// 1분에 한 번만 정리한다
	function prune(now: number) {
		if (now - prunedAt < 60_000) return;
		prunedAt = now;
		for (const [key, e] of entries) {
			if (now - e.start >= windowMs && e.until <= now) entries.delete(key);
		}
	}

	return {
		blocked(key, now = Date.now()) {
			return (entries.get(key)?.until ?? 0) > now;
		},
		fail(key, now = Date.now()) {
			prune(now);
			const current = entries.get(key);
			const e = current && now - current.start < windowMs ? current : { count: 0, start: now, until: 0 };
			e.count += 1;
			if (e.count >= max) e.until = now + windowMs;
			entries.set(key, e);
		},
		reset(key) {
			entries.delete(key);
		}
	};
}

export const passwordLimiter = createLimiter({ max: 10, windowMs: 15 * 60_000 });

export const TOO_MANY_ATTEMPTS = '로그인 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요.';
