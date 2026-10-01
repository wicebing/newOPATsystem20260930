import type { Execution, Campus } from './opat';

export interface ExecutorSummary {
  key: string;
  id: string;
  name: string;
  campus: string;
  executions: number;
  patients: number;
  courses: number;
  drugs: number;
  first: Date;
  last: Date;
}

export function executorKey(event: Execution): string {
  return event.executorId || `${event.campus}|${event.executorName || '未記錄'}`;
}

export function groupExecutors(events: Execution[]): ExecutorSummary[] {
  const groups = new Map<string, { summary: ExecutorSummary; campuses: Set<Campus>; patients: Set<string>; courses: Set<string>; drugs: Set<string> }>();
  events.forEach(event => {
    const key = executorKey(event);
    let group = groups.get(key);
    if (!group) {
      group = {
        summary: { key, id: event.executorId, name: event.executorName || '未記錄', campus: event.campus,
          executions: 0, patients: 0, courses: 0, drugs: 0, first: event.time, last: event.time },
        campuses: new Set(), patients: new Set(), courses: new Set(), drugs: new Set(),
      };
      groups.set(key, group);
    }
    group.summary.executions++;
    group.campuses.add(event.campus);
    if (event.chartNo) group.patients.add(`${event.campus}|${event.chartNo}`);
    group.courses.add(event.courseId);
    group.drugs.add(event.drugCode);
    if (event.time < group.summary.first) group.summary.first = event.time;
    if (event.time > group.summary.last) group.summary.last = event.time;
  });
  return [...groups.values()].map(({ summary, campuses, patients, courses, drugs }) => ({
    ...summary, campus: [...campuses].join(' / '), patients: patients.size, courses: courses.size, drugs: drugs.size,
  })).sort((a, b) => b.executions - a.executions || a.name.localeCompare(b.name, 'zh-TW'));
}
