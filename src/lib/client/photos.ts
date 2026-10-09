import { PHOTO_MAX_EDGE } from '$lib/domain/photos';

const QUALITY = 0.85;

// 긴 변을 PHOTO_MAX_EDGE 이하로 줄여 JPEG data URL로 만든다
// 작은 사진은 키우지 않는다
// Safari가 HEIC 디코딩과 EXIF 회전을 처리하므로 직접 회전하지 않는다
// 줄인 크기의 캔버스에만 그려 iOS 캔버스 화소 한도를 넘지 않는다
export async function shrinkPhoto(file: File): Promise<string> {
	const url = URL.createObjectURL(file);
	try {
		const image = new Image();
		image.src = url;
		await image.decode();
		const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
		canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
		canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/jpeg', QUALITY);
	} finally {
		URL.revokeObjectURL(url);
	}
}
