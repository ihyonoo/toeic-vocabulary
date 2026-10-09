// 사진 등록에서 앱과 서버가 같이 쓰는 한도 (PRD R-46, R-48)
export const MAX_PHOTOS = 5;
// OpenAI 고해상도 처리의 최대 변 길이
export const PHOTO_MAX_EDGE = 2048;
export const PHOTO_DATA_PREFIX = 'data:image/jpeg;base64,';
// data URL 길이, 약 3MB
export const PHOTO_MAX_LENGTH = 4_000_000;
