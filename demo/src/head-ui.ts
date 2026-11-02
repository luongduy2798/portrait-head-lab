import { HeadError, type HeadErrorCode, type Progress } from '@twa/portrait-head';

export const headProgressLabel: Record<Progress['phase'], string> = {
  loadingModel: 'Đang tải bộ nhận diện trên máy…',
  detecting: 'Đang tìm khuôn mặt…',
  segmenting: 'Đang tách tóc và vùng da…',
  fitting: 'Đang khớp hình dáng khuôn mặt…',
  texturing: 'Đang hoàn thiện đầu và màu da…',
};

const messages: Record<HeadErrorCode, string> = {
  invalidImage: 'Không đọc được ảnh. Hãy chọn JPEG, PNG hoặc WebP hợp lệ.',
  noFace: 'Không tìm thấy mặt. Hãy chọn ảnh rõ mặt và crop lại.',
  multipleFaces: 'Có nhiều khuôn mặt. Hãy crop để chỉ còn một người.',
  smallFace: 'Khuôn mặt quá nhỏ. Hãy chỉnh crop cho rõ toàn bộ mặt.',
  frontalFace: 'Hãy chọn ảnh nhìn thẳng để dựng đầu 3D.',
  landmarks: 'Khuôn mặt bị cắt sát mép hoặc landmark không hợp lệ. Hãy chỉnh crop.',
  assets: 'Không tải được asset hoặc checksum không khớp. Hãy kiểm tra URL và bộ file trên host.',
  generation: 'Không thể dựng đầu 3D. Hãy thử lại bằng ảnh khác hoặc trình duyệt mới.',
};

export function headErrorMessage(error: unknown, fallback: string): string {
  return error instanceof HeadError ? messages[error.code] : error instanceof Error ? error.message : fallback;
}
