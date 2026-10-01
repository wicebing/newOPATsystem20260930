export type RawRow = Record<string, unknown>;
export type Campus = '新竹' | '竹北' | '竹東' | '未判定';
export type DrugKind = 'injectable-antibiotic' | 'diluent' | 'other' | 'review';

export interface SourceFile {
  name: string;
  rows: RawRow[];
}

export interface RecordRow {
  id: string;
  file: string;
  rowNumber: number;
  raw: RawRow;
  campus: Campus;
  account: string;
  chartNo: string;
  department: string;
  doctor: string;
  treatment: string;
  drugCode: string;
  drugName: string;
  frequency: string;
  diagnosis: string;
  status: string;
  failed: string;
  executionCount: number;
  feeCount: number;
  refund: number;
  detail: string;
  executorDetail: string;
  times: Date[];
  executors: { id: string; name: string }[];
  visitDate: Date | null;
  confirmDate: Date | null;
  startDate: Date | null;
  endDate: Date | null;
  transferEmergency: Date | null;
  transferHospital: Date | null;
  kind: DrugKind;
  courseId: string;
}

export interface Execution {
  id: string;
  rowId: string;
  courseId: string;
  campus: Campus;
  account: string;
  chartNo: string;
  drugCode: string;
  drugName: string;
  department: string;
  doctor: string;
  executorId: string;
  executorName: string;
  treatment: string;
  frequency: string;
  kind: DrugKind;
  time: Date;
  month: string;
  date: string;
  reportingDate: string;
}

export interface FeeClaim {
  account: string;
  campus: Campus;
  courseId: string;
  count: number;
  month: string;
  rowId: string;
}

export interface Course {
  id: string;
  campus: Campus;
  chartNo: string;
  accounts: string[];
  source: string;
  doctor: string;
  department: string;
  diagnosis: string;
  openingDate: Date | null;
  openingMonth: string;
  firstScheduledDate: Date | null;
  lastScheduledDate: Date | null;
  firstExecution: Date | null;
  lastExecution: Date | null;
  executionCount: number;
  failed: boolean;
  transferred: boolean;
  transferEmergency: Date | null;
  transferHospital: Date | null;
  feeCount: number;
}

export interface DataIssue {
  code: string;
  level: 'warning' | 'review';
  message: string;
  rowId: string;
  account: string;
  campus: Campus;
}

export interface Analysis {
  snapshotDate: Date;
  snapshotSource: 'filename' | 'system';
  snapshotWarning: string;
  records: RecordRow[];
  executions: Execution[];
  feeClaims: FeeClaim[];
  courses: Course[];
  issues: DataIssue[];
  months: string[];
  drugCatalog: { code: string; name: string; kind: DrugKind; rows: number }[];
}

export const CAMPUSES: Campus[] = ['新竹', '竹北', '竹東'];
export const POINTS = { nursing: 0.1, pharmacy: 0.05, medicalAffairs: 0.025 };

export function courseStatus(course: Course, today = new Date()): '失敗標記' | '轉診' | '有執行' | '待施行' | '未執行' | '排程中' {
  if (course.failed) return '失敗標記';
  if (course.transferred) return '轉診';
  if (course.executionCount > 0) return '有執行';
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (course.firstScheduledDate && course.firstScheduledDate > startOfToday) return '待施行';
  if (course.lastScheduledDate && course.lastScheduledDate < startOfToday) return '未執行';
  return '排程中';
}

// Codes observed in the supplied OPAT exports. New injectable products stay in review until checked.
const ANTIBIOTIC_CODES = new Set([
  'INV1AK39', 'SIN1AB20', 'CEI1AB20', 'AVE1AK33', 'CR1AK40',
  'CUB1AK48', 'BRO1AB44', 'TAR1AN02', 'SUP1AB23', 'ACE1AC01',
  'CIP1AK30', 'UN1AA33', 'TAT1AB16', 'ZIN1AB43', 'MEP1AK17', 'TAI1AK57',
]);

function value(input: unknown): string {
  return input == null ? '' : String(input).trim();
}

function number(input: unknown): number {
  const parsed = Number(value(input).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateParts(input: string): number[] | null {
  const normalized = input.replace(/^(\d{4})(\d{2})(\d{2})/, '$1/$2/$3');
  const match = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0)];
}

export function parseOpatDate(input: unknown): Date | null {
  const parts = dateParts(value(input));
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts;
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  return date;
}

export function snapshotDateFromFilename(filename: string): Date | null {
  const match = filename.match(/(?:^|[^\d])(\d{7,8})(?!\d)/);
  if (!match) return null;
  const value = match[1];
  const year = value.length === 7 ? Number(value.slice(0, 3)) + 1911 : Number(value.slice(0, 4));
  return parseOpatDate(`${year}${value.slice(-4)}`);
}

export function formatDate(date: Date | null, withTime = false): string {
  if (!date) return '—';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${y}-${m}-${d}${withTime ? ` ${time}` : ''}`;
}

export function reportingDate(date: Date): string {
  const shifted = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()) - 8 * 3600_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function reportingMonth(date: Date): string {
  return reportingDate(date).slice(0, 7);
}

export function classifyDrug(code: string, name: string): DrugKind {
  const normalizedCode = code.toUpperCase().replace(/\s+/g, '');
  const normalizedName = name.toLowerCase();
  if (normalizedCode.startsWith('SAL') || /saline|sodium chloride|稀釋液|diluent/.test(normalizedName)) return 'diluent';
  if (ANTIBIOTIC_CODES.has(normalizedCode)) return 'injectable-antibiotic';
  if (/\b(tab|tablet|cap|capsule|oral|cream|oint|supp|pack)\b|口服|軟膏/.test(normalizedName) || /^[A-Z ]{2,4}[245789]/.test(normalizedCode)) return 'other';
  return 'review';
}

function campusFor(row: RawRow, file: string): Campus {
  const supplied = value(row['院區']);
  if (CAMPUSES.includes(supplied as Campus)) return supplied as Campus;
  const account = value(row['帳號']);
  const chartNo = value(row['病歷號']);
  if (/個案資料h(?:\.[^.]+)?$/i.test(file) || /^\d{2}T4/.test(account) || /^H/i.test(chartNo)) return '新竹';
  return '未判定';
}

function splitDetails(detail: string): string[] {
  return detail.split(/[，,;；\n]+/).map(part => part.trim()).filter(Boolean);
}

function parseExecutor(detail: string): { id: string; name: string } {
  const match = detail.match(/^([A-Za-z]\d{5})\s*(.*)$/);
  return match ? { id: match[1].toUpperCase(), name: match[2].trim() } : { id: '', name: detail };
}

function firstDate(row: RecordRow): Date | null {
  return row.confirmDate || row.visitDate || row.startDate || row.times[0] || null;
}

function addIssue(issues: DataIssue[], row: RecordRow, code: string, message: string, level: DataIssue['level'] = 'review') {
  issues.push({ code, level, message, rowId: row.id, account: row.account, campus: row.campus });
}

export function analyze(files: SourceFile[]): Analysis {
  const issues: DataIssue[] = [];
  const records: RecordRow[] = [];
  const fileDates = files.map(file => snapshotDateFromFilename(file.name));
  const parsedDates = fileDates.filter((date): date is Date => date !== null);
  const snapshotDate = parsedDates.length
    ? new Date(Math.min(...parsedDates.map(date => date.getTime())))
    : new Date();
  const snapshotWarning = !parsedDates.length
    ? '檔名沒有可辨識的下載日期，待執行判定暫以今天為準。'
    : fileDates.some(date => date === null)
      ? '部分檔名沒有可辨識的下載日期，待執行判定採已辨識檔案中最早日期。'
      : new Set(parsedDates.map(date => formatDate(date))).size > 1
        ? '檔案下載日期不一致，待執行判定採最早日期。'
        : '';

  files.forEach((file, fileIndex) => file.rows.forEach((raw, index) => {
    const detail = value(raw['執行次數明細']);
    const executorDetail = value(raw['執行人員明細']);
    const timeParts = splitDetails(detail);
    const executorParts = splitDetails(executorDetail);
    const validEntries = timeParts.map((part, position) => ({ time: parseOpatDate(part), executor: parseExecutor(executorParts[position] || '') }))
      .filter((entry): entry is { time: Date; executor: { id: string; name: string } } => entry.time !== null);
    const times = validEntries.map(entry => entry.time);
    const row: RecordRow = {
      id: `${fileIndex}:${index + 2}`,
      file: file.name,
      rowNumber: index + 2,
      raw,
      campus: campusFor(raw, file.name),
      account: value(raw['帳號']),
      chartNo: value(raw['病歷號']),
      department: value(raw['科別']),
      doctor: value(raw['看診醫師']),
      treatment: value(raw['診療行為']),
      drugCode: value(raw['藥品八碼']).toUpperCase().replace(/\s+/g, ''),
      drugName: value(raw['組合商品名']),
      frequency: value(raw['頻率']).toUpperCase(),
      diagnosis: value(raw['主診斷名稱']),
      status: value(raw['狀態']),
      failed: value(raw['失敗個案']),
      executionCount: number(raw['執行次數']),
      feeCount: number(raw['39029C管理費數量']),
      refund: number(raw['針劑應退量']),
      detail,
      executorDetail,
      times,
      executors: validEntries.map(entry => entry.executor),
      visitDate: parseOpatDate(raw['帳號看診日']),
      confirmDate: parseOpatDate(raw['確認日期']),
      startDate: parseOpatDate(raw['開始日']),
      endDate: parseOpatDate(raw['結束日']),
      transferEmergency: parseOpatDate(raw['轉急診日']),
      transferHospital: parseOpatDate(raw['轉住院日']),
      kind: classifyDrug(value(raw['藥品八碼']), value(raw['組合商品名'])),
      courseId: '',
    };
    if (!row.account || !row.chartNo) addIssue(issues, row, 'missing-id', '缺少帳號或病歷號，請核對來源');
    if (row.campus === '未判定') addIssue(issues, row, 'campus', '院區無法判定，未納入院區績效');
    if (row.kind === 'review' && (row.executionCount > 0 || row.times.length > 0)) addIssue(issues, row, 'drug-review', '藥品種類待確認，暫不計入護理與藥劑');
    if (detail && times.length !== timeParts.length) addIssue(issues, row, 'invalid-time', '執行明細有無法解析的時間');
    if (timeParts.length && executorParts.length !== timeParts.length) addIssue(issues, row, 'executor-mismatch', `執行時間 ${timeParts.length} 筆，人員明細 ${executorParts.length} 筆；無法完整對應執行人員`);
    if (row.executionCount !== times.length && (row.executionCount > 0 || times.length > 0)) addIssue(issues, row, 'count-mismatch', `執行次數 ${row.executionCount}，明細時間 ${times.length} 筆`);
    if (row.refund !== 0 && times.length > 0) addIssue(issues, row, 'refund-execution', '退量非零但有執行明細，已依明細保留施打', 'warning');
    records.push(row);
  }));

  const accountKeys = [...new Set(records.map(row => `${row.campus}|${row.account}`))];
  const parent = new Map(accountKeys.map(key => [key, key]));
  const find = (key: string): string => {
    const current = parent.get(key) || key;
    if (current === key) return key;
    const root = find(current);
    parent.set(key, root);
    return root;
  };
  const accountRows = new Map<string, RecordRow[]>();
  records.forEach(row => {
    const key = `${row.campus}|${row.account}`;
    accountRows.set(key, [...(accountRows.get(key) || []), row]);
  });
  const byPatient = new Map<string, string[]>();
  accountRows.forEach((rows, key) => {
    const patientKey = `${rows[0].campus}|${rows[0].chartNo}`;
    byPatient.set(patientKey, [...(byPatient.get(patientKey) || []), key]);
  });
  byPatient.forEach(keys => {
    const d1 = keys.filter(key => accountRows.get(key)!.some(row => row.treatment.includes('門診轉OPAT') && row.treatment.includes('D1')));
    const d2 = keys.filter(key => accountRows.get(key)!.some(row => row.treatment.includes('門診轉OPAT') && row.treatment.includes('D2-')));
    d2.forEach(later => {
      const laterDate = Math.min(...accountRows.get(later)!.map(row => (firstDate(row)?.getTime() ?? Infinity)));
      const candidates = d1.map(earlier => ({ key: earlier, date: Math.min(...accountRows.get(earlier)!.map(row => (firstDate(row)?.getTime() ?? Infinity))) }))
        .filter(candidate => laterDate >= candidate.date && laterDate - candidate.date <= 7 * 86400_000)
        .sort((a, b) => b.date - a.date);
      if (candidates[0]) parent.set(find(later), find(candidates[0].key));
    });
  });
  records.forEach(row => { row.courseId = find(`${row.campus}|${row.account}`); });

  const executionMap = new Map<string, Execution>();
  records.forEach(row => row.times.forEach((time, index) => {
    const key = `${row.courseId}|${row.drugCode}|${time.getTime()}`;
    const prior = executionMap.get(key);
    if (prior) {
      const currentExecutor = row.executors[index];
      const priorPerson = prior.executorId || prior.executorName;
      const currentPerson = currentExecutor?.id || currentExecutor?.name;
      if (priorPerson && currentPerson && priorPerson !== currentPerson) {
        addIssue(issues, row, 'executor-conflict', `重複施打時間 ${formatDate(time, true)} 的執行人員不一致，請人工核對`);
      }
      addIssue(issues, row, 'duplicate', `重複執行時間 ${formatDate(time, true)}，已排除重複計數`);
      return;
    }
    executionMap.set(key, {
      id: key, rowId: row.id, courseId: row.courseId, campus: row.campus,
      account: row.account, chartNo: row.chartNo, drugCode: row.drugCode,
      drugName: row.drugName, department: row.department, doctor: row.doctor,
      executorId: row.executors[index]?.id || '', executorName: row.executors[index]?.name || '',
      treatment: row.treatment, frequency: row.frequency, kind: row.kind,
      time, month: reportingMonth(time), date: formatDate(time), reportingDate: reportingDate(time),
    });
  }));
  const uniqueExecutions = [...executionMap.values()].sort((a, b) => a.time.getTime() - b.time.getTime());

  const dayGroups = new Map<string, Execution[]>();
  uniqueExecutions.filter(event => event.kind === 'injectable-antibiotic' || event.kind === 'review').forEach(event => {
    const key = `${event.courseId}|${event.drugCode}|${event.date}`;
    dayGroups.set(key, [...(dayGroups.get(key) || []), event]);
  });
  const excessEvents = new Set<string>();
  dayGroups.forEach(events => {
    const expected = events[0].frequency === 'QD' ? 1 : /Q12H|BID/.test(events[0].frequency) ? 2 : null;
    if (expected !== null && events.length > expected) {
      events.slice(expected).forEach(event => {
        excessEvents.add(event.id);
        const row = records.find(item => item.id === event.rowId)!;
        addIssue(issues, row, 'frequency', `${event.date} ${event.frequency} 超過每日 ${expected} 次，該次已排除計分`);
      });
    }
  });
  const executions = uniqueExecutions.filter(event => !excessEvents.has(event.id));

  const claimsByAccount = new Map<string, RecordRow>();
  records.filter(row => row.feeCount > 0 && row.account && !row.treatment.includes('門診轉OPAT「D1」'))
    .sort((a, b) => ((a.times[0] || firstDate(a))?.getTime() ?? Infinity) - ((b.times[0] || firstDate(b))?.getTime() ?? Infinity))
    .forEach(row => {
      const key = `${row.campus}|${row.account}`;
      if (!claimsByAccount.has(key)) claimsByAccount.set(key, row);
    });
  const feeClaims: FeeClaim[] = [...claimsByAccount.values()].map(row => {
    const time = row.times[0];
    const date = firstDate(row);
    const month = time ? reportingMonth(time) : date ? formatDate(date).slice(0, 7) : '日期未明';
    return { account: row.account, campus: row.campus, courseId: row.courseId, count: row.feeCount, month, rowId: row.id };
  });

  const courseRows = new Map<string, RecordRow[]>();
  records.forEach(row => courseRows.set(row.courseId, [...(courseRows.get(row.courseId) || []), row]));
  const courses: Course[] = [...courseRows.entries()].map(([id, rows]) => {
    const dates = rows.map(firstDate).filter((date): date is Date => date !== null).sort((a, b) => a.getTime() - b.getTime());
    const scheduledStarts = rows.map(row => row.startDate).filter((date): date is Date => date !== null).sort((a, b) => a.getTime() - b.getTime());
    const scheduledEnds = rows.map(row => row.endDate).filter((date): date is Date => date !== null).sort((a, b) => a.getTime() - b.getTime());
    const events = executions.filter(event => event.courseId === id && event.kind === 'injectable-antibiotic');
    const first = rows[0];
    const treatment = rows.map(row => row.treatment).join(' ');
    return {
      id, campus: first.campus, chartNo: first.chartNo,
      accounts: [...new Set(rows.map(row => row.account))],
      source: treatment.includes('門診轉OPAT') ? '門診' : treatment.includes('住院轉OPAT') ? '住院' : '急診',
      doctor: first.doctor, department: first.department, diagnosis: first.diagnosis,
      openingDate: dates[0] || events[0]?.time || null,
      openingMonth: dates[0] ? formatDate(dates[0]).slice(0, 7) : events[0]?.month || '日期未明',
      firstScheduledDate: scheduledStarts[0] || null,
      lastScheduledDate: scheduledEnds.at(-1) || null,
      firstExecution: events[0]?.time || null,
      lastExecution: events.at(-1)?.time || null,
      executionCount: events.length,
      failed: rows.some(row => row.failed.toUpperCase() === 'Y'),
      transferred: rows.some(row => row.transferEmergency !== null || row.transferHospital !== null),
      transferEmergency: rows.find(row => row.transferEmergency)?.transferEmergency || null,
      transferHospital: rows.find(row => row.transferHospital)?.transferHospital || null,
      feeCount: feeClaims.filter(claim => claim.courseId === id).reduce((sum, claim) => sum + claim.count, 0),
    };
  });

  const catalogMap = new Map<string, { code: string; name: string; kind: DrugKind; rows: number }>();
  records.forEach(row => {
    const key = row.drugCode || row.drugName;
    const current = catalogMap.get(key);
    if (current) current.rows += 1;
    else catalogMap.set(key, { code: row.drugCode, name: row.drugName, kind: row.kind, rows: 1 });
  });

  const monthSet = new Set([
    ...executions.map(event => event.month),
    ...feeClaims.map(claim => claim.month),
    ...courses.map(course => course.openingMonth),
  ]);
  records.forEach(row => {
    if (!row.startDate || !row.endDate || row.endDate < row.startDate ||
      row.endDate.getTime() - row.startDate.getTime() > 366 * 86400_000) return;
    for (let date = new Date(row.startDate.getFullYear(), row.startDate.getMonth(), 1); date <= row.endDate; date.setMonth(date.getMonth() + 1)) {
      monthSet.add(formatDate(date).slice(0, 7));
    }
  });
  const months = [...monthSet].filter(month => /^\d{4}-\d{2}$/.test(month)).sort();

  return { snapshotDate, snapshotSource: parsedDates.length ? 'filename' : 'system', snapshotWarning,
    records, executions, feeClaims, courses, issues, months, drugCatalog: [...catalogMap.values()].sort((a, b) => b.rows - a.rows) };
}

export interface PerformanceRow {
  campus: Campus;
  rawNursing: number;
  excludedNursing: number;
  nursing: number;
  pharmacy: number;
  medicalAffairs: number;
  nursingPoints: number;
  pharmacyPoints: number;
  medicalAffairsPoints: number;
  totalPoints: number;
}

export function performance(analysis: Analysis, month: string, includedCodes: Set<string>): PerformanceRow[] {
  const eligible = analysis.executions.filter(event => includedCodes.has(event.drugCode) && (month === 'all' || event.month === month));
  return CAMPUSES.map(campus => {
    const events = eligible.filter(event => event.campus === campus);
    const sourceRows = analysis.records.filter(row => row.campus === campus && includedCodes.has(row.drugCode) &&
      row.executionCount > 0 && row.times.some(time => month === 'all' || reportingMonth(time) === month));
    const pharmacy = sourceRows.reduce((sum, row) => sum + (month === 'all'
      ? new Set(row.times.map(reportingMonth)).size : 1), 0);
    const rawNursing = analysis.records.filter(row => row.campus === campus && includedCodes.has(row.drugCode))
      .reduce((sum, row) => sum + row.times.filter(time => month === 'all' || reportingMonth(time) === month).length, 0);
    const medicalAffairs = analysis.feeClaims.filter(claim => claim.campus === campus && (month === 'all' || claim.month === month)).reduce((sum, claim) => sum + claim.count, 0);
    const nursing = events.length;
    const nursingPoints = nursing * POINTS.nursing;
    const pharmacyPoints = pharmacy * POINTS.pharmacy;
    const medicalAffairsPoints = medicalAffairs * POINTS.medicalAffairs;
    const round = (value: number) => Math.round(value * 1000) / 1000;
    return { campus, rawNursing, excludedNursing: rawNursing - nursing, nursing, pharmacy, medicalAffairs, nursingPoints: round(nursingPoints), pharmacyPoints: round(pharmacyPoints), medicalAffairsPoints: round(medicalAffairsPoints), totalPoints: round(nursingPoints + pharmacyPoints + medicalAffairsPoints) };
  });
}
