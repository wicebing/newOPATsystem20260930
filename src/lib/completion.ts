import { formatDate } from './opat';
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
  status: '完成' | '未完成' | '進行中' | '中斷/轉診' | '資料不足';
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
  return includedCodes.has(row.drugCode) && (row.kind === 'injectable-antibiotic' || row.kind === 'review');
}

function dayKey(courseId: string, drugCode: string, date: string): string {
  return `${courseId}|${drugCode}|${date}`;
}

export function buildCompletion(analysis: Analysis, includedCodes: Set<string>, today = new Date()): CompletionReport {
  const asOf = formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const scheduled = new Map<string, ScheduledDay>();
  const invalidCourses = new Set<string>();
  const eligibleRows = analysis.records.filter(row => isScheduled(row, includedCodes));

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

  const actual = new Map<string, number>();
  analysis.executions.filter(event => includedCodes.has(event.drugCode) && (event.kind === 'injectable-antibiotic' || event.kind === 'review'))
    .forEach(event => {
      const key = dayKey(event.courseId, event.drugCode, event.date);
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
    else if (lastScheduledDate > asOf) status = '進行中';
    else status = days.every(day => day.executed >= day.expected) ? '完成' : '未完成';
    return { courseId: course.id, campus: course.campus, chartNo: course.chartNo, openingMonth: course.openingMonth, expected, executed, lastScheduledDate, status };
  });

  const eligibleCourses = new Set(courses.filter(course => course.status !== '中斷/轉診' && course.status !== '資料不足').map(course => course.courseId));
  const dueDays = allDays.filter(day => day.date <= asOf && eligibleCourses.has(day.courseId));
  return { days: dueDays, courses, asOf };
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
