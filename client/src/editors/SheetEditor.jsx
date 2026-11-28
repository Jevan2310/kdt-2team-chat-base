import { useEffect, useRef, useState } from 'react';
import { Workbook } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import { transformExcelToFortune, transformFortuneToExcel } from '@corbe30/fortune-excel';

// 엑셀(xlsx·csv): FortuneSheet (MIT) + FortuneExcel (MIT, 파일 읽기·만들기)
// 주의: 복잡한 서식(피벗·매크로·일부 차트)은 읽을 때 빠지거나 바뀔 수 있다 → 시험판에서 실제 파일로 확인할 것
// 계산값이 저장되지 않은 수식(엑셀이 아닌 프로그램이 만든 파일)은 열 때 빈칸 → 그 칸을 고치면 계산됨
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// 저장 전에 FortuneExcel 이 못 다루는 모양을 고쳐서 넘긴다 (라이브러리 버그 우회)
// 1) 한 번도 열지 않은 시트는 data 가 없고 celldata 만 있음 → 그대로면 빈 시트로 저장돼 내용이 사라짐
// 2) 글자 칸이 inlineStr 인데 조각(s)이 없으면 내보내기가 멈춤 → 일반 칸으로
// 3) 읽어 올 때 숫자가 글자("120")로 들어와서 그대로 저장하면 엑셀에서 글자 칸이 됨 → 일반 서식의 숫자 모양 글자는 숫자로
//    (텍스트 서식 '@' 칸과 0으로 시작하는 값 "0123" 은 그대로 둠)
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
function fixCell(c) {
  if (!c) return c;
  if (c.ct?.t === 'inlineStr' && !Array.isArray(c.ct.s)) return { ...c, ct: { fa: 'General', t: 'g' } };
  if (!c.f && typeof c.v === 'string' && NUMBER.test(c.v) && c.ct?.fa !== '@' && (c.ct?.t ?? 'g') !== 's') {
    return { ...c, v: Number(c.v), ct: { fa: c.ct?.fa ?? 'General', t: 'n' } };
  }
  return c;
}
function exportableRef(sheetRef) {
  const api = sheetRef.current;
  return {
    current: {
      getSheet: () => api.getSheet(),
      getAllSheets: () =>
        api.getAllSheets().map((sheet) => {
          const data = sheet.data ?? api.celldataToData(sheet.celldata ?? [], sheet.row, sheet.column) ?? [];
          return { ...sheet, data: data.map((row) => (row ?? []).map(fixCell)) };
        }),
    },
  };
}

// 보고 있던 시트 표시(status 1)가 없는 파일(우리 편집기가 저장한 파일 등)은 FortuneSheet 가 "sheet not found" 로 멈춤 → 첫 시트를 보이게
function withActiveSheet(sheets) {
  if (!sheets?.length || sheets.some((sh) => Number(sh.status) === 1)) return sheets;
  return sheets.map((sh, i) => ({ ...sh, status: i === 0 ? 1 : 0 }));
}

export default function SheetEditor({ blob, file, readOnly, saverRef, onDirty }) {
  const [sheets, setSheets] = useState(null);
  const [key, setKey] = useState(0);
  const [error, setError] = useState('');
  const sheetRef = useRef(null);
  const readyRef = useRef(false); // 열면서 라이브러리가 열 너비·줄 높이를 맞추는 동작은 "고침"으로 치지 않음
  const isCsv = /\.csv$/i.test(file.name);

  useEffect(() => {
    let cancelled = false;
    let timer;
    readyRef.current = false;
    const asFile = new File([blob], file.name, { type: isCsv ? 'text/csv' : XLSX_TYPE });
    // 넷째 인자(ref)를 비워 둔다: 라이브러리가 읽은 직후 타이머로 열 너비를 다시 맞추는데, 표가 준비되기 전이면 "sheet not found" 로 멈춤
    // (열 너비·줄 높이는 시트 정보 config 에 이미 들어 있어 표가 그릴 때 반영됨)
    transformExcelToFortune(asFile, (s) => !cancelled && setSheets(withActiveSheet(s)), setKey, { current: null })
      .then(() => {
        timer = setTimeout(() => (readyRef.current = true), 300);
      })
      .catch((err) => !cancelled && setError(`이 파일을 읽지 못했어요. (${err?.message ?? err})`));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [blob, file.name, isCsv]);

  useEffect(() => {
    saverRef.current = async () => {
      const out = await transformFortuneToExcel(exportableRef(sheetRef), isCsv ? 'csv' : 'xlsx', false);
      return new Blob([out], { type: isCsv ? 'text/csv' : XLSX_TYPE });
    };
    return () => {
      saverRef.current = null;
    };
  }, [saverRef, isCsv]);

  if (error) return <p className="form-error viewer-message">{error}</p>;
  if (!sheets) return <p className="muted viewer-message">표를 읽는 중…</p>;
  return (
    <div className="sheet-editor">
      <Workbook
        key={key}
        ref={sheetRef}
        data={sheets}
        allowEdit={!readOnly}
        showToolbar={!readOnly}
        // onOp: 사람이 실제로 고칠 때만 옴 (onChange 는 열 때·계산할 때도 와서 "고침" 판단에 못 씀)
        onOp={() => readyRef.current && onDirty()}
      />
    </div>
  );
}
