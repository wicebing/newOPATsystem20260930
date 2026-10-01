import * as XLSX from 'xlsx';
import type { Analysis, PerformanceRow, SourceFile } from './opat';
import { formatDate, reportingMonth } from './opat';
import { groupExecutors } from './staff';
import { summarizeCompletion } from './completion';
import type { CompletionReport } from './completion';

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

export function createReportWorkbook(analysis: Analysis, rows: PerformanceRow[], month: string, campus: string, includedCodes: Set<string>, completion: CompletionReport): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const recordById = new Map(analysis.records.map(row => [row.id, row]));
  const courseById = new Map(analysis.courses.map(course => [course.id, course]));
  const progressById = new Map(completion.courses.map(course => [course.courseId, course]));
  const selectedRows = rows.filter(row => campus === '全部院區' || row.campus === campus);
  const summary = selectedRows.map(row => ({
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
  const selectedEvents = analysis.executions.filter(event => includedCodes.has(event.drugCode) && (month === 'all' || event.month === month) && (campus === '全部院區' || event.campus === campus));
  const executions = selectedEvents.map(event => ({
    院區: event.campus, 帳號: event.account, 病歷號: event.chartNo, 執行人員代碼: event.executorId, 執行人員: event.executorName,
    執行時間: formatDate(event.time, true), 績效月份: event.month,
    科別: event.department, 看診醫師: event.doctor, 診療行為: event.treatment,
    藥品八碼: event.drugCode, 組合商品名: event.drugName, 頻率: event.frequency,
    來源檔案: recordById.get(event.rowId)?.file || '',
    來源列號: recordById.get(event.rowId)?.rowNumber || '',
  }));
  const legacyCleaned = analysis.records.filter(row => includedCodes.has(row.drugCode) && (row.kind === 'injectable-antibiotic' || row.kind === 'review') &&
    (campus === '全部院區' || row.campus === campus) && (month === 'all' || row.times.some(time => reportingMonth(time) === month) ||
      (row.startDate && formatDate(row.startDate).slice(0, 7) <= month && formatDate(row.endDate || row.startDate).slice(0, 7) >= month)))
    .map(row => ({ ...row.raw, 院區: row.campus }));
  const legacyPerformance = selectedRows.map(row => ({ campus: row.campus, nursing: row.nursing, pharmacy: row.pharmacy, medicalAffairs: row.medicalAffairs }));
  const executors = groupExecutors(selectedEvents).map(person => ({
    院區: person.campus, 人員代碼: person.id, 執行人員: person.name,
    施打次數: person.executions, 病人數: person.patients, 療程數: person.courses,
    藥品種類: person.drugs, 首次施打: formatDate(person.first, true), 最後施打: formatDate(person.last, true),
  }));
  const completionRows = (campus === '全部院區' ? ['全部院區', '新竹', '竹北', '竹東'] : [campus]).map(name => {
    const result = summarizeCompletion(completion, month, name);
    return { 月份: month === 'all' ? '全部期間' : month, 院區: name, 截至: completion.asOf,
      預定施打: result.expected, 已完成施打: result.executed, 未完成施打: result.missed,
      '施打完成率(%)': result.doseRate === null ? '' : Math.round(result.doseRate * 1000) / 10,
      到期療程: result.dueCourses, 完成療程: result.completedCourses,
      '療程完成率(%)': result.courseRate === null ? '' : Math.round(result.courseRate * 1000) / 10,
      中斷或轉診: result.interruptedCourses, 排程資料不足: result.unknownCourses };
  });
  const selectedCourseIds = new Set([
    ...selectedEvents.map(event => event.courseId),
    ...completion.days.filter(day => month === 'all' || day.date.startsWith(month)).map(day => day.courseId),
  ]);
  const courseRows = analysis.courses.filter(course => (campus === '全部院區' || course.campus === campus) &&
    (month === 'all' || course.openingMonth === month || selectedCourseIds.has(course.id) ||
      (course.firstScheduledDate && course.lastScheduledDate &&
        formatDate(course.firstScheduledDate).slice(0, 7) <= month && formatDate(course.lastScheduledDate).slice(0, 7) >= month))).map(course => {
    const progress = progressById.get(course.id);
    return { 院區: course.campus, 病歷號: course.chartNo, 帳號: course.accounts.join(' / '), 來源: course.source,
      開案日: formatDate(course.openingDate), 最後預定日: progress?.lastScheduledDate || '',
      預定施打: progress?.expected ?? '', 已完成施打: progress?.executed ?? '',
      完成狀態: progress?.status || '無注射抗生素排程', 首次施打: formatDate(course.firstExecution),
      最後施打: formatDate(course.lastExecution), 管理費申報數: course.feeCount };
  });
  const scheduleRows = completion.days.filter(day => (month === 'all' || day.date.startsWith(month)) &&
    (campus === '全部院區' || day.campus === campus)).map(day => ({
    院區: day.campus, 病歷號: courseById.get(day.courseId)?.chartNo || '',
    日期: day.date, 藥品八碼: day.drugCode, 組合商品名: day.drugName,
    預定次數: day.expected, 實際次數: day.executed, 未完成次數: day.expected - day.executed,
  }));
  const issues = analysis.issues.filter(issue => campus === '全部院區' || issue.campus === campus).map(issue => ({
    院區: issue.campus, 帳號: issue.account, 類型: issue.code,
    說明: issue.message, 原始列: issue.rowId,
  }));
  const append = (name: string, values: Record<string, unknown>[], emptyHeaders: string[]) => {
    const sheet = values.length ? XLSX.utils.json_to_sheet(values) : XLSX.utils.aoa_to_sheet([emptyHeaders]);
    sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1' };
    sheet['!cols'] = Object.keys(values[0] || Object.fromEntries(emptyHeaders.map(header => [header, '']))).map(header => ({ wch: Math.min(32, Math.max(12, header.length * 2 + 2)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  append('績效總表', summary, ['月份', '院區', '護理執行次數', '藥劑保管筆數', '管理費申報數']);
  append('完成率', completionRows, ['月份', '院區', '預定施打', '已完成施打']);
  append('Step2原系統格式', legacyPerformance, ['campus', 'nursing', 'pharmacy', 'medicalAffairs']);
  append('執行人員統計', executors, ['院區', '人員代碼', '執行人員', '施打次數']);
  append('施打明細', executions, ['院區', '帳號', '病歷號', '執行人員代碼', '執行人員', '執行時間']);
  append('療程明細', courseRows, ['院區', '病歷號', '帳號', '完成狀態']);
  append('排程對照', scheduleRows, ['院區', '病歷號', '日期', '預定次數', '實際次數']);
  append('Step1清理資料', legacyCleaned, Object.keys(analysis.records[0]?.raw || { 帳號: '', 病歷號: '', 院區: '' }));
  append('資料檢核', issues, ['院區', '帳號', '類型', '說明', '原始列']);
  return workbook;
}

export function downloadReport(analysis: Analysis, rows: PerformanceRow[], month: string, campus: string, includedCodes: Set<string>, completion: CompletionReport) {
  const workbook = createReportWorkbook(analysis, rows, month, campus, includedCodes, completion);
  XLSX.writeFile(workbook, `OPAT_${month === 'all' ? '全部期間' : month}_${campus}.xlsx`);
}
