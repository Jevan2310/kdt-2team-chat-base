import Dialog from '../common/Dialog.jsx';
import PersonRow from '../users/PersonRow.jsx';

// "읽은 사람" 창: 이 메시지를 읽은 사람만 프로필과 함께 보여 준다 (보낸 사람 제외)
export default function ReadersDialog({ readers, onClose }) {
  return (
    <Dialog title={`읽은 사람 ${readers.length}`} onClose={onClose}>
      {readers.length === 0 ? (
        <p className="muted">아직 읽은 사람이 없어요.</p>
      ) : (
        <div className="person-list">
          {readers.map((p) => (
            <PersonRow key={p.id} user={p} />
          ))}
        </div>
      )}
    </Dialog>
  );
}
