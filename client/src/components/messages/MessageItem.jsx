// 메시지 종류(type)마다 그리는 컴포넌트를 고른다.
// 새 종류(예: 챗봇 bot, 휴가 vacation)를 추가하려면 컴포넌트를 만들고 아래 표에 한 줄 추가한다.

const timeOf = (createdAt) => createdAt?.slice(11, 16) ?? ''; // "2026-11-27 13:19:58" → "13:19"

function TextMessage({ message, mine }) {
  return (
    <div className={`msg ${mine ? 'msg-mine' : ''}`}>
      {!mine && (
        <div className="msg-author">
          {message.user?.nickname ?? '알 수 없음'}
          {message.user?.department && <small> · {message.user.department}</small>}
        </div>
      )}
      <div className="msg-row">
        <div className="msg-bubble">{message.content}</div>
        <span className="msg-time">{timeOf(message.createdAt)}</span>
      </div>
    </div>
  );
}

function SystemMessage({ message }) {
  return <div className="msg-system">{message.content}</div>;
}

const RENDERERS = {
  text: TextMessage,
  system: SystemMessage,
};

export default function MessageItem({ message, mine }) {
  const Renderer = RENDERERS[message.type] ?? TextMessage; // 모르는 종류는 일반 글처럼
  return <Renderer message={message} mine={mine} />;
}
