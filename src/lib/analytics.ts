import { CAMPUSES } from './opat';
import type { Analysis, Campus, Execution, KnownCampus } from './opat';

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
    if (!selectedCourses.has(row.courseId) || !row.doctor) return;
    const key = `${row.campus}|${row.doctor}`;
    let group = groups.get(key);
    if (!group) {
      group = { doctor: row.doctor, department: row.department, campus: row.campus, courses: new Set(), drugs: new Map() };
      groups.set(key, group);
    }
    group.courses.add(row.courseId);
    if (!includedCodes.has(row.drugCode)) return;
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
