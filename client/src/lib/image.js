// 사진을 가운데 기준 정사각형으로 잘라 size×size JPEG 로 줄인다 (프로필 사진 업로드 전에).
// 큰 원본(수 MB)을 그대로 올리지 않아서 빠르고, 서버 저장 공간도 아낀다.
export async function toSquareJpeg(file, size = 256) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file); // 휴대폰 사진의 회전 정보(EXIF)도 반영된다
  } catch {
    throw new Error('이 사진은 열 수 없어요. JPG·PNG 사진으로 올려 주세요.');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // 투명한 PNG 는 흰 배경으로
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close?.();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('사진을 바꾸지 못했어요.'))), 'image/jpeg', 0.85);
  });
}
