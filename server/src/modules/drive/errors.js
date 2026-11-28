// 드라이브에서 생기는 "사용자에게 보여 줄" 오류 (상태 코드 + 안내 문구)
export class DriveError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
