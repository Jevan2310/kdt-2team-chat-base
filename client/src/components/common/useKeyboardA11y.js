import { useEffect, useRef } from 'react';

// 키보드만으로도 떠 있는 메뉴·창을 쓸 수 있게 하는 도우미 훅들

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// 열릴 때 포커스가 있던 곳(메뉴를 연 ⋯ 버튼, 말풍선 등)을 기억했다가 닫힐 때 되돌려 준다
export function useRestoreFocus() {
  useEffect(() => {
    const opener = document.activeElement;
    return () => {
      if (opener && opener !== document.body && opener.isConnected) opener.focus?.({ preventScroll: true });
    };
  }, []);
}

// 메뉴: 자리를 잡으면(ready) 첫 항목에 포커스, ↑↓←→·Home·End 로 이동, Tab 이면 닫기
export function useMenuKeyboard(ref, { ready, onClose }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const menu = ref.current;
    if (!menu || !ready) return;
    const items = () => [...menu.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    items()[0]?.focus({ preventScroll: true });
    const onKeyDown = (e) => {
      const list = items();
      const i = list.indexOf(document.activeElement);
      const go = (n) => {
        e.preventDefault();
        list[(n + list.length) % list.length]?.focus();
      };
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === 'Home') go(0);
      else if (e.key === 'End') go(list.length - 1);
      else if (e.key === 'Tab') {
        e.preventDefault();
        closeRef.current?.();
      }
    };
    menu.addEventListener('keydown', onKeyDown);
    return () => menu.removeEventListener('keydown', onKeyDown);
  }, [ref, ready]);
}

// 가운데 창: 열리면 안쪽으로 포커스(이미 안에 있으면 그대로), Tab 이 창 밖으로 나가지 않게
export function useFocusTrap(ref) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    if (!box.contains(document.activeElement)) (box.querySelector(FOCUSABLE) ?? box).focus({ preventScroll: true });
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const list = [...box.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    box.addEventListener('keydown', onKeyDown);
    return () => box.removeEventListener('keydown', onKeyDown);
  }, [ref]);
}
