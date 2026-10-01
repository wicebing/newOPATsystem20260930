import * as XLSX from 'xlsx';
import type { Analysis, PerformanceRow, SourceFile } from './opat';
import { formatDate } from './opat';

const REQUIRED = ['帳號', '病歷號', '診療行為', '組合商品名', '執行次數', '執行次數明細', '39029C管理費數量'];

export async function readExcelFiles(files: File[]): Promise<SourceFile[]> {
  const sources: SourceFile[] = [];
  for (const file of files) {
    if (!/\.xlsx?$/i.test(file.name)) throw new Error(`${file.name} 不是 Excel .xlsx/.xls 檔案`);
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    let found = false;
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const headers = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: 0, blankrows: false })[0] || [];
      if (!REQUIRED.every(column => headers.includes(column))) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false, blankrows: false });
      sources.push({ name: file.name, rows });
      found = true;
    }
    if (!found) throw new Error(`${file.name} 找不到 OPAT 欄位：${REQUIRED.join('、')}`);
  }
  return sources;
}

export function downloadReport(analysis: Analysis, rows: PerformanceRow[], month: string, campus: string, includedCodes: Set<string>) {
  const workbook = XLSX.utils.book_new();
  const summary = rows.filter(row => campus === '全部院區' || row.campus === campus).map(row => ({
    月份: month === 'all' ? '全部期間' : month,
    院區: row.campus,
    護理執行次數: row.nursing,
    護理點數: row.nursingPoints,
    藥劑保管筆數: row.pharmacy,
    藥劑點數: row.pharmacyPoints,
    管理費申報數: row.medicalAffairs,
    醫事點數: row.medicalAffairsPoints,
    總點數: row.totalPoints,
  }));
  const executions = analysis.executions.filter(event => includedCodes.has(event.drugCode) && (month === 'all' || event.month === month) && (campus === '全部院區' || event.campus === campus)).map(event => ({
    院區: event.campus, 帳號: event.account, 病歷號: event.chartNo,
    執行時間: formatDate(event.time, true), 績效月份: event.month,
    診療行為: event.treatment, 藥品八碼: event.drugCode,
    組合商品名: event.drugName, 原始列: event.rowId,
  }));
  const issues = analysis.issues.filter(issue => campus === '全部院區' || issue.campus === campus).map(issue => ({
    院區: issue.campus, 帳號: issue.account, 類型: issue.code,
    說明: issue.message, 原始列: issue.rowId,
  }));
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), '績效總表');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(executions), '施打明細');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(issues), '資料檢核');
  XLSX.writeFile(workbook, `OPAT_${month === 'all' ? '全部期間' : month}_${campus}.xlsx`);
}
