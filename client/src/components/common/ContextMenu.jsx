import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 떠 있는 메뉴 (우클릭 메뉴, ⋯ 버튼 메뉴). anchor = { x, y, aboveY?, alignRight? }
// 화면 밖으로 나가지 않게 자리를 잡고, 밖을 누르거나 Esc·스크롤·창 크기 변경이면 닫힌다.
export default function ContextMenu({ anchor, onClose, label, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = anchor.alignRight ? anchor.x - width : anchor.x;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = anchor.y;
    let up = false;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, (anchor.aboveY ?? anchor.y) - height);
      up = true;
    }
    setPos({ left, top, up });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => e.key === 'Escape' && onClose();
    const onScroll = (e) => {
      if (!ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true); // 목록 안 스크롤도 잡도록 capture
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`msg-menu ${pos?.up ? 'msg-menu-up' : ''}`}
      role="menu"
      aria-label={label}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
