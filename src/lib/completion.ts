import { formatDate, isSelectedAntibiotic } from './opat';
import type { Analysis, Campus, Course, RecordRow } from './opat';

export interface ScheduledDay {
  courseId: string;
  campus: Campus;
  drugCode: string;
  drugName: string;
  date: string;
  expected: number;
  executed: number;
}

export interface CourseProgress {
  courseId: string;
  campus: Campus;
  chartNo: string;
  openingMonth: string;
  expected: number;
  executed: number;
  lastScheduledDate: string;
  status: '完成' | '未完成' | '進行中' | '待執行' | '中斷/轉診' | '資料不足';
}

export interface DailyComparison {
  key: string;
  name: string;
  預定: number;
  實際: number;
  完成: number;
  未完成: number;
  未對應排程: number;
}

export interface CompletionReport {
  days: ScheduledDay[];
  courses: CourseProgress[];
  asOf: string;
}

export interface CompletionSummary {
  expected: number;
  executed: number;
  missed: number;
  doseRate: number | null;
  dueCourses: number;
  completedCourses: number;
  courseRate: number | null;
  interruptedCourses: number;
  unknownCourses: number;
}

function dailyExpected(frequency: string): number | null {
  if (/^(QD|Q24H|QN|HS)$/.test(frequency)) return 1;
  if (/^(Q12H|BID)$/.test(frequency)) return 2;
  if (/^(Q8H|TID)$/.test(frequency)) return 3;
  if (/^(Q6H|QID)$/.test(frequency)) return 4;
  if (/^(ONCE|STAT)$/.test(frequency)) return 1;
  return null;
}

function isScheduled(row: RecordRow, includedCodes: Set<string>): boolean {
  return isSelectedAntibiotic(row.drugCode, row.kind, includedCodes);
}

function dayKey(courseId: string, drugCode: string, date: string): string {
  return `${courseId}|${drugCode}|${date}`;
}

function collectSchedule(analysis: Analysis, includedCodes: Set<string>) {
  const scheduled = new Map<string, ScheduledDay>();
  const invalidCourses = new Set<string>();
  const eligibleRows = analysis.records.filter(row => !row.duplicateOf && isScheduled(row, includedCodes));

  eligibleRows.forEach(row => {
    const expected = dailyExpected(row.frequency);
    if (!row.startDate || !row.endDate || expected === null || row.startDate > row.endDate ||
      row.endDate.getTime() - row.startDate.getTime() > 366 * 86400_000) {
      invalidCourses.add(row.courseId);
      return;
    }
    for (let date = new Date(row.startDate.getFullYear(), row.startDate.getMonth(), row.startDate.getDate()); date <= row.endDate; date.setDate(date.getDate() + 1)) {
      const keyDate = formatDate(date);
      const key = dayKey(row.courseId, row.drugCode, keyDate);
      const count = /^(ONCE|STAT)$/.test(row.frequency) ? (keyDate === formatDate(row.startDate) ? 1 : 0) : expected;
      if (!count) continue;
      const prior = scheduled.get(key);
      if (!prior || count > prior.expected) scheduled.set(key, {
        courseId: row.courseId, campus: row.campus, drugCode: row.drugCode,
        drugName: row.drugName, date: keyDate, expected: count, executed: 0,
      });
    }
  });

  return { scheduled, invalidCourses, eligibleRows };
}

export function scheduledDoses(analysis: Analysis, includedCodes: Set<string>): ScheduledDay[] {
  return [...collectSchedule(analysis, includedCodes).scheduled.values()];
}

export function buildCompletion(analysis: Analysis, includedCodes: Set<string>, today = new Date()): CompletionReport {
  const asOf = formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const { scheduled, invalidCourses, eligibleRows } = collectSchedule(analysis, includedCodes);

  const actual = new Map<string, number>();
  analysis.executions.filter(event => isSelectedAntibiotic(event.drugCode, event.kind, includedCodes) && event.date <= asOf)
    .forEach(event => {
      const key = dayKey(event.courseId, event.drugCode, event.attributedDate);
      actual.set(key, (actual.get(key) || 0) + 1);
    });
  scheduled.forEach((day, key) => { day.executed = Math.min(day.expected, actual.get(key) || 0); });

  const allDays = [...scheduled.values()];
  const byCourse = new Map<string, ScheduledDay[]>();
  allDays.forEach(day => byCourse.set(day.courseId, [...(byCourse.get(day.courseId) || []), day]));
  const eligibleCourseIds = new Set(eligibleRows.map(row => row.courseId));
  const courses = analysis.courses.filter(course => eligibleCourseIds.has(course.id)).map((course: Course): CourseProgress => {
    const days = byCourse.get(course.id) || [];
    const lastScheduledDate = days.reduce((last, day) => day.date > last ? day.date : last, '');
    const due = days.filter(day => day.date <= asOf);
    const expected = due.reduce((sum, day) => sum + day.expected, 0);
    const executed = due.reduce((sum, day) => sum + day.executed, 0);
    let status: CourseProgress['status'];
    if (!days.length || invalidCourses.has(course.id)) status = '資料不足';
    else if (course.failed || course.transferred) status = '中斷/轉診';
    else if (lastScheduledDate > asOf) status = expected === 0 && executed === 0 ? '待執行' : '進行中';
    else status = days.every(day => day.executed >= day.expected) ? '完成' : '未完成';
    return { courseId: course.id, campus: course.campus, chartNo: course.chartNo, openingMonth: course.openingMonth, expected, executed, lastScheduledDate, status };
  });

  const eligibleCourses = new Set(courses.filter(course => course.status !== '中斷/轉診' && course.status !== '資料不足').map(course => course.courseId));
  const dueDays = allDays.filter(day => day.date <= asOf && eligibleCourses.has(day.courseId));
  return { days: dueDays, courses, asOf };
}

export function dailyComparison(analysis: Analysis, report: CompletionReport, includedCodes: Set<string>, month = 'all', campus = '全部院區'): DailyComparison[] {
  const days = new Map<string, DailyComparison>();
  const dayFor = (date: string) => {
    const found = days.get(date);
    if (found) return found;
    const item = { key: date, name: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
      預定: 0, 實際: 0, 完成: 0, 未完成: 0, 未對應排程: 0 };
    days.set(date, item);
    return item;
  };
  report.days.filter(day => (month === 'all' || day.date.startsWith(month)) && (campus === '全部院區' || day.campus === campus))
    .forEach(day => { dayFor(day.date).預定 += day.expected; dayFor(day.date).完成 += day.executed; });
  analysis.executions.filter(event => isSelectedAntibiotic(event.drugCode, event.kind, includedCodes) && event.date <= report.asOf &&
    (campus === '全部院區' || event.campus === campus))
    .forEach(event => {
      const date = event.attributedDate <= report.asOf ? event.attributedDate : event.date;
      if (month === 'all' || date.startsWith(month)) dayFor(date).實際 += 1;
    });
  const compared = [...days.values()].sort((a, b) => a.key.localeCompare(b.key)).map(item => ({
    ...item, 未完成: Math.max(0, item.預定 - item.完成),
    未對應排程: Math.max(0, item.實際 - item.完成),
  }));
  if (month !== 'all') return compared;
  const months = new Map<string, DailyComparison>();
  compared.forEach(day => {
    const key = day.key.slice(0, 7);
    const item = months.get(key) || { key, name: key, 預定: 0, 實際: 0, 完成: 0, 未完成: 0, 未對應排程: 0 };
    item.預定 += day.預定;
    item.實際 += day.實際;
    item.完成 += day.完成;
    item.未完成 += day.未完成;
    item.未對應排程 += day.未對應排程;
    months.set(key, item);
  });
  return [...months.values()];
}

export function summarizeCompletion(report: CompletionReport, month = 'all', campus = '全部院區'): CompletionSummary {
  const days = report.days.filter(day => (month === 'all' || day.date.startsWith(month)) && (campus === '全部院區' || day.campus === campus));
  const courses = report.courses.filter(course =>
    (month === 'all' || course.lastScheduledDate.startsWith(month) || (!course.lastScheduledDate && course.openingMonth === month)) &&
    (campus === '全部院區' || course.campus === campus));
  const expected = days.reduce((sum, day) => sum + day.expected, 0);
  const executed = days.reduce((sum, day) => sum + day.executed, 0);
  const dueCourses = courses.filter(course => course.status === '完成' || course.status === '未完成').length;
  const completedCourses = courses.filter(course => course.status === '完成').length;
  return {
    expected, executed, missed: expected - executed,
    doseRate: expected ? executed / expected : null,
    dueCourses, completedCourses, courseRate: dueCourses ? completedCourses / dueCourses : null,
    interruptedCourses: courses.filter(course => course.status === '中斷/轉診').length,
    unknownCourses: courses.filter(course => course.status === '資料不足').length,
  };
}
