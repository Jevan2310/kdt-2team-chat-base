import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REACTION_EMOJIS } from './reactions.js';

// 글자 복사. http 주소(맥미니 IP 등)에서는 navigator.clipboard 가 막혀 있어서 옛 방식으로 한 번 더 시도한다
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

// 메시지 메뉴 (PC: 우클릭한 자리, 휴대폰: 누른 말풍선 아래)
// anchor = { x, y, aboveY, alignRight }: (x, y)에 띄우고, 아래 공간이 모자라면 aboveY 위쪽에 띄운다
export default function MessageMenu({ message, mine, anchor, onClose, ctx }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const [confirming, setConfirming] = useState(false);

  // 메뉴 크기를 재서 화면 밖으로 나가지 않게 자리를 잡는다 (그리기 전에 계산 → 깜빡임 없음)
  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    const margin = 8;
    let left = anchor.alignRight ? anchor.x - width : anchor.x;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    let top = anchor.y;
    let fromBelow = false;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.aboveY - height);
      fromBelow = true; // 위로 펼쳐질 때는 아래에서 올라오는 효과
    }
    setPos({ left, top, fromBelow });
  }, [anchor, confirming]);

  const run = (fn) => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      ref={ref}
      className={`msg-menu ${pos?.fromBelow ? 'msg-menu-up' : ''}`}
      role="menu"
      aria-label="메시지 메뉴"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {confirming ? (
        <>
          <p className="msg-menu-confirm">이 메시지를 삭제할까요?</p>
          <button type="button" role="menuitem" className="danger" onClick={() => run(() => ctx.onDelete(message))}>
            삭제
          </button>
          <button type="button" role="menuitem" onClick={() => setConfirming(false)}>취소</button>
        </>
      ) : (
        <>
          <div className="msg-menu-emojis">
            {REACTION_EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                role="menuitem"
                aria-label={`${emoji} 반응`}
                className={message.reactions?.some((r) => r.emoji === emoji && r.userIds.includes(ctx.myId)) ? 'on' : ''}
                onClick={() => run(() => ctx.onReact(message, emoji))}
              >
                {emoji}
              </button>
            ))}
          </div>
          <button type="button" role="menuitem" onClick={() => run(() => ctx.onShowReaders(message))}>👀 읽음 확인</button>
          <button type="button" role="menuitem" onClick={() => run(() => copyText(message.content))}>📋 복사</button>
          {mine && (
            <button type="button" role="menuitem" onClick={() => run(() => ctx.onStartEdit(message.id))}>✏️ 수정</button>
          )}
          {mine && (
            <button type="button" role="menuitem" className="danger" onClick={() => setConfirming(true)}>🗑️ 삭제</button>
          )}
        </>
      )}
    </div>,
    document.body,
  );
}
