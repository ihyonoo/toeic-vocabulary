declare global {
	namespace App {
		interface Locals {
			authed: boolean;
		}
		interface PageState {
			// 목록에서 카드 보기로 왔는지 (뒤로 가기로 목록 스크롤을 지키려고)
			fromList?: boolean;
		}
	}
}

export {};
