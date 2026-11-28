import { useEffect, useRef } from 'react';

// svg·gif·bmp: 보기만. <img> 로 그리므로 svg 안의 스크립트는 실행되지 않는다
export default function PictureViewer({ blob, file }) {
  const imgRef = useRef(null);
  useEffect(() => {
    // svg 는 형식을 분명히 붙여야 <img> 가 그린다
    const typed = /\.svg$/i.test(file.name) ? new Blob([blob], { type: 'image/svg+xml' }) : blob;
    const url = URL.createObjectURL(typed);
    imgRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob, file.name]);
  return (
    <div className="picture-viewer">
      <img ref={imgRef} alt={file.name} />
    </div>
  );
}
