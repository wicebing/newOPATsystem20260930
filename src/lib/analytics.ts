import { CAMPUSES, formatDate, isSelectedAntibiotic } from './opat';
import type { Analysis, Campus, Execution, KnownCampus } from './opat';
import { scheduledDoses } from './completion';

export interface WeeklyRow {
  key: string;
  name: string;
  新竹: number;
  竹北: number;
  竹東: number;
  total: number;
}

function weekStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() - (value.getDay() + 6) % 7);
  return formatDate(value);
}

function weeklyRow(key: string): WeeklyRow {
  const [year, month, day] = key.split('-').map(Number);
  const end = new Date(year, month - 1, day + 6);
  return { key, name: `${month}/${day}–${end.getMonth() + 1}/${end.getDate()}`,
    新竹: 0, 竹北: 0, 竹東: 0, total: 0 };
}

export function weeklyOrders(analysis: Analysis, includedCodes: Set<string>, month = 'all'):
  { courses: WeeklyRow[]; doses: WeeklyRow[] } {
  const courseCounts = new Map<string, WeeklyRow>();
  const doseCounts = new Map<string, WeeklyRow>();
  const add = (groups: Map<string, WeeklyRow>, date: string, campus: Campus, amount: number) => {
    if (!CAMPUSES.includes(campus as KnownCampus) || (month !== 'all' && !date.startsWith(month))) return;
    const key = weekStart(date);
    const item = groups.get(key) || weeklyRow(key);
    item[campus as KnownCampus] += amount;
    item.total += amount;
    groups.set(key, item);
  };
  analysis.courses.forEach(course => {
    if (course.openingDate) add(courseCounts, formatDate(course.openingDate), course.campus, 1);
  });
  scheduledDoses(analysis, includedCodes).forEach(day => add(doseCounts, day.date, day.campus, day.expected));
  const weeks = [...new Set([...courseCounts.keys(), ...doseCounts.keys()])].sort();
  return {
    courses: weeks.map(key => courseCounts.get(key) || weeklyRow(key)),
    doses: weeks.map(key => doseCounts.get(key) || weeklyRow(key)),
  };
}

export interface HourlyRow {
  name: string;
  新竹: number;
  竹北: number;
  竹東: number;
  total: number;
}

export function hourlyByCampus(events: Execution[]): HourlyRow[] {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    name: `${String(hour).padStart(2, '0')}:00`, 新竹: 0, 竹北: 0, 竹東: 0, total: 0,
  }));
  events.forEach(event => {
    if (!CAMPUSES.includes(event.campus as KnownCampus)) return;
    const item = hours[event.time.getHours()];
    item[event.campus as KnownCampus] += 1;
    item.total += 1;
  });
  return hours;
}

export interface PrescribedDrug {
  code: string;
  name: string;
  courses: number;
}

export interface PrescriberRow {
  key: string;
  doctor: string;
  department: string;
  campus: Campus;
  courses: number;
  byDrug: Record<string, { courses: number; rate: number }>;
}

export interface PrescribingMatrix {
  drugs: PrescribedDrug[];
  doctors: PrescriberRow[];
}

export function prescribingMatrix(analysis: Analysis, includedCodes: Set<string>, month: string, campus: Campus | '全部院區'): PrescribingMatrix {
  const selectedCourses = new Set(analysis.courses.filter(course =>
    (month === 'all' || course.openingMonth === month) &&
    (campus === '全部院區' || course.campus === campus)).map(course => course.id));
  const groups = new Map<string, { doctor: string; department: string; campus: Campus; courses: Set<string>; drugs: Map<string, Set<string>> }>();
  const drugCourses = new Map<string, Set<string>>();
  const drugNames = new Map<string, string>();

  analysis.records.forEach(row => {
    if (!selectedCourses.has(row.courseId) || !row.doctor ||
      !isSelectedAntibiotic(row.drugCode, row.kind, includedCodes)) return;
    const key = `${row.campus}|${row.doctor}`;
    let group = groups.get(key);
    if (!group) {
      group = { doctor: row.doctor, department: row.department, campus: row.campus, courses: new Set(), drugs: new Map() };
      groups.set(key, group);
    }
    group.courses.add(row.courseId);
    if (!group.drugs.has(row.drugCode)) group.drugs.set(row.drugCode, new Set());
    group.drugs.get(row.drugCode)!.add(row.courseId);
    if (!drugCourses.has(row.drugCode)) drugCourses.set(row.drugCode, new Set());
    drugCourses.get(row.drugCode)!.add(row.courseId);
    if (!drugNames.has(row.drugCode)) drugNames.set(row.drugCode, row.drugName);
  });

  const drugs = [...drugCourses].map(([code, courses]) => ({ code, name: drugNames.get(code) || code, courses: courses.size }))
    .sort((a, b) => b.courses - a.courses || a.code.localeCompare(b.code));
  const doctors = [...groups].map(([key, group]) => ({
    key, doctor: group.doctor, department: group.department, campus: group.campus,
    courses: group.courses.size,
    byDrug: Object.fromEntries([...group.drugs].map(([code, courses]) => [code, {
      courses: courses.size, rate: courses.size / group.courses.size,
    }])),
  })).sort((a, b) => b.courses - a.courses || a.doctor.localeCompare(b.doctor, 'zh-TW'));
  return { drugs, doctors };
}
