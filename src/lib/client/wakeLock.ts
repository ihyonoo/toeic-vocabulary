// 학습 중 화면 꺼짐 방지 (R-40)
// 지원하지 않거나 HTTP면 아무것도 하지 않는다
export function keepScreenOn(): () => void {
	if (!('wakeLock' in navigator)) return () => {};
	let sentinel: WakeLockSentinel | null = null;
	let active = true;

	async function request() {
		try {
			const lock = await navigator.wakeLock.request('screen');
			// 받기 전에 화면을 떠났으면 바로 놓는다
			if (active) sentinel = lock;
			else lock.release().catch(() => {});
		} catch {
			sentinel = null;
		}
	}

	// 앱을 다녀오면 잠금이 풀리므로 다시 요청한다
	function onVisibility() {
		if (active && document.visibilityState === 'visible') request();
	}

	request();
	document.addEventListener('visibilitychange', onVisibility);
	return () => {
		active = false;
		document.removeEventListener('visibilitychange', onVisibility);
		sentinel?.release().catch(() => {});
	};
}
