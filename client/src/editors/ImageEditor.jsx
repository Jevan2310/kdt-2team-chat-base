import { useEffect, useRef, useState } from 'react';
import FilerobotImageEditor, { TABS, TOOLS } from 'react-filerobot-image-editor';
import PictureViewer from './PictureViewer.jsx';

// 사진(png·jpg·webp): Filerobot Image Editor (MIT) — 자르기·회전·밝기·필터·글자/도형·크기
// 저장은 원래와 같은 형식으로 (jpg 는 jpg 로)
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

export default function ImageEditor({ blob, file, readOnly, saverRef, onDirty }) {
  const [image, setImage] = useState(null); // 다 읽은 <img> (편집기에 넘김)
  const getImgRef = useRef(null);
  const ext = (/\.([^.]+)$/.exec(file.name)?.[1] ?? 'png').toLowerCase();
  const mime = TYPES[ext] ?? 'image/png';

  useEffect(() => {
    if (readOnly) return undefined;
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => setImage(img);
    img.src = url;
    return () => {
      img.onload = null;
      URL.revokeObjectURL(url);
    };
  }, [blob, readOnly]);

  useEffect(() => {
    saverRef.current = async () => {
      const get = getImgRef.current;
      if (!get) return null;
      const { imageData, hideLoadingSpinner } = get({ name: file.name.replace(/\.[^.]+$/, ''), extension: ext === 'jpg' ? 'jpeg' : ext, quality: 0.92 }, 1, false);
      hideLoadingSpinner?.();
      if (imageData.imageCanvas) {
        return new Promise((resolve) => imageData.imageCanvas.toBlob(resolve, mime, 0.92));
      }
      return imageData.imageBase64 ? (await fetch(imageData.imageBase64)).blob() : null;
    };
    return () => {
      saverRef.current = null;
    };
  }, [saverRef, file.name, ext, mime]);

  if (readOnly) return <PictureViewer blob={blob} file={file} />;
  if (!image) return <p className="muted viewer-message">사진을 읽는 중…</p>;
  return (
    <div className="image-editor">
      <FilerobotImageEditor
        source={image}
        getCurrentImgDataFnRef={getImgRef}
        onModify={onDirty}
        removeSaveButton
        useAiTab={false}
        useCloudimage={false}
        tabsIds={[TABS.ADJUST, TABS.FINETUNE, TABS.FILTERS, TABS.ANNOTATE, TABS.RESIZE]}
        defaultTabId={TABS.ADJUST}
        defaultToolId={TOOLS.CROP}
        savingPixelRatio={1}
        previewPixelRatio={window.devicePixelRatio || 1}
        avoidChangesNotSavedAlertOnLeave
        observePluginContainerSize
      />
    </div>
  );
}
