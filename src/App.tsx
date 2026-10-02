import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, Check, ChevronDown, ClipboardList,
  FileSpreadsheet, Filter, FolderOpen, LayoutDashboard, Pill, Plus, Search,
  ShieldCheck, Stethoscope, Trash2, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  analyze, CAMPUSES, courseStatus, formatDate, performance, POINTS, reportingMonth,
} from './lib/opat';
import type { Analysis, Campus, DataIssue } from './lib/opat';
import { buildCompletion, dailyComparison, summarizeCompletion } from './lib/completion';
import type { DailyComparison } from './lib/completion';
import { executorKey, groupExecutors } from './lib/staff';
import { hourlyByCampus, prescribingMatrix } from './lib/analytics';
import type { HourlyRow } from './lib/analytics';

type View = 'overview' | 'execution' | 'staff' | 'performance' | 'cases' | 'audit';
const COLORS = ['#087c72', '#e57443', '#8b65a3', '#d6a637', '#5c92b3', '#9ba8a4'];
const NAV: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '總覽', icon: LayoutDashboard },
  { id: 'execution', label: '執行分析', icon: Activity },
  { id: 'staff', label: '執行人員', icon: Users },
  { id: 'performance', label: '績效點數', icon: ClipboardList },
  { id: 'cases', label: '個案明細', icon: Users },
  { id: 'audit', label: '資料檢核', icon: ShieldCheck },
];

function number(value: number, decimals = 0) {
  return value.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function percentage(value: number | null): string {
  return value === null ? '—' : `${number(value * 100, 1)}%`;
}

function statLine(label: string, value: string | number, accent: string, icon: LucideIcon) {
  const Icon = icon;
  return <div className="stat" key={label} style={{ '--stat-accent': accent } as React.CSSProperties}>
    <div className="stat-top"><span>{label}</span><Icon size={17} strokeWidth={1.8} /></div>
    <strong>{value}</strong>
  </div>;
}

function Section({ title, detail, action, children, className = '' }: { title: string; detail?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`section ${className}`}>
    <div className="section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>
    {children}
  </section>;
}

function Chart({ children, empty = false }: { children: ReactNode; empty?: boolean }) {
  return <div className="chart">{empty ? <div className="chart-empty">此範圍沒有資料</div> : children}</div>;
}

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map((entry, index) => <span key={index} style={{ color: entry.color }}>{entry.name}　{number(Number(entry.value || 0))}</span>)}</div>;
}

function ComparisonTooltip({ active, payload }: { active?: boolean; payload?: { payload?: DailyComparison }[] }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="chart-tooltip"><strong>{item.key}</strong><span>預定　{number(item.預定)}</span><span>實際　{number(item.實際)}</span><span style={{ color: COLORS[1] }}>未完成　{number(item.未完成)}</span><span style={{ color: COLORS[2] }}>未對應排程　{number(item.未對應排程)}</span></div>;
}

function ComparisonChart({ values }: { values: DailyComparison[] }) {
  return <Chart empty={!values.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={values} margin={{ top: 12, right: 8, left: -22, bottom: 0 }} barCategoryGap="25%"><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" minTickGap={20} tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} domain={[0, 'auto']} tick={{ fontSize: 11 }} /><Tooltip content={<ComparisonTooltip />} /><Legend /><Bar dataKey="完成" stackId="dose" fill={COLORS[0]} /><Bar dataKey="未完成" stackId="dose" fill={COLORS[1]} /><Bar dataKey="未對應排程" stackId="dose" fill={COLORS[2]} /></BarChart></ResponsiveContainer></Chart>;
}

function RankedBars({ values, color, axisWidth }: { values: { name: string; value: number; label: string }[]; color: string; axisWidth: number }) {
  return <Chart empty={!values.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={values} layout="vertical" margin={{ top: 8, right: 92, left: 4, bottom: 8 }}><CartesianGrid stroke="#e8eded" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={axisWidth} tick={{ fontSize: 11 }} /><Tooltip content={<TooltipContent />} /><Bar dataKey="value" name="數量" fill={color} radius={[0, 3, 3, 0]}><LabelList dataKey="label" position="right" fill="#3e5651" fontSize={11} /></Bar></BarChart></ResponsiveContainer></Chart>;
}

function HourlyTooltip({ active, payload, campus = '全部院區' }: { active?: boolean; payload?: { payload?: HourlyRow }[]; campus?: Campus | '全部院區' }) {
  const item = payload?.[0]?.payload;
  if (!active || !item) return null;
  return <div className="chart-tooltip"><strong>{item.name}　{campus === '全部院區' ? '合計' : campus} {number(campus === '全部院區' ? item.total : item[campus as typeof CAMPUSES[number]])}</strong>{CAMPUSES.filter(name => campus === '全部院區' || name === campus).map(name => <span key={name} style={{ color: COLORS[CAMPUSES.indexOf(name)] }}>{name}　{number(item[name])}</span>)}</div>;
}

function HourlyDistribution({ values, campus, empty }: { values: HourlyRow[]; campus: Campus | '全部院區'; empty: boolean }) {
  const campuses = CAMPUSES.filter(name => campus === '全部院區' || campus === name);
  const sharedMax = Math.max(1, ...values.map(item => Math.max(...CAMPUSES.map(name => item[name]))));
  return <><Chart empty={empty}><ResponsiveContainer width="100%" height="100%"><BarChart data={values} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" interval={2} tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} domain={[0, 'auto']} tick={{ fontSize: 11 }} /><Tooltip content={<HourlyTooltip campus={campus} />} /><Legend />{campuses.map(name => <Bar key={name} dataKey={name} stackId="hour" fill={COLORS[CAMPUSES.indexOf(name)]} />)}</BarChart></ResponsiveContainer></Chart>
    {campus === '全部院區' && !empty && <div className="campus-hourly">{CAMPUSES.map(name => <div key={name} className="campus-hour"><h3>{name} · {number(values.reduce((sum, item) => sum + item[name], 0))} 次</h3><div className="campus-hour-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={values} margin={{ top: 6, right: 5, left: -26, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" interval={5} tick={{ fontSize: 10 }} /><YAxis domain={[0, sharedMax]} allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip content={<HourlyTooltip campus={name} />} /><Bar dataKey={name} fill={COLORS[CAMPUSES.indexOf(name)]} /></BarChart></ResponsiveContainer></div></div>)}</div>}
  </>;
}

function ExecutionTrend({ values, campus, empty }: { values: Record<string, string | number>[]; campus: Campus | '全部院區'; empty: boolean }) {
  const campuses = CAMPUSES.filter(name => campus === '全部院區' || campus === name);
  return <><Chart empty={empty}><ResponsiveContainer width="100%" height="100%"><AreaChart data={values} margin={{ top: 12, right: 14, left: -24, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" minTickGap={25} tick={{ fontSize: 11 }} /><YAxis domain={[0, 'auto']} allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip content={<TooltipContent />} /><Legend />{campuses.map(name => <Area key={name} dataKey={name} stackId="a" stroke={COLORS[CAMPUSES.indexOf(name)]} fill={COLORS[CAMPUSES.indexOf(name)]} fillOpacity={0.8} />)}</AreaChart></ResponsiveContainer></Chart>
    {campus === '全部院區' && !empty && <div className="campus-trends">{CAMPUSES.map(name => <div className="campus-trend" key={name}><h3>{name}</h3><div className="campus-trend-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={values} margin={{ top: 6, right: 8, left: -25, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" minTickGap={20} tick={{ fontSize: 10 }} /><YAxis domain={[0, 'auto']} allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip content={<TooltipContent />} /><Area dataKey={name} stroke={COLORS[CAMPUSES.indexOf(name)]} fill={COLORS[CAMPUSES.indexOf(name)]} fillOpacity={0.45} /></AreaChart></ResponsiveContainer></div></div>)}</div>}
  </>;
}

function EmptyState({ fileCount, onChoose, onAnalyze, onDrop }: { fileCount: number; onChoose: () => void; onAnalyze: () => void; onDrop: (event: DragEvent<HTMLDivElement>) => void }) {
  return <div className="empty-state" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
    <div className="empty-icon"><FileSpreadsheet size={32} strokeWidth={1.5} /></div>
    <h2>{fileCount ? `已加入 ${fileCount} 個 Excel 檔案` : '匯入 OPAT 個案資料'}</h2>
    <p>{fileCount ? '可繼續加入檔案；分析時會自動整合所有檔案。' : '可逐次加入 g、h 原始 Excel 檔；院區與多檔資料會自動整合。'}</p>
    <div className="empty-actions">
      <button className={fileCount ? 'button ghost' : 'primary-button'} onClick={onChoose}><FolderOpen size={18} /> {fileCount ? '繼續加入檔案' : '選擇 Excel 檔案'}</button>
      {fileCount > 0 && <button className="primary-button" onClick={onAnalyze}><Activity size={18} /> 開始分析</button>}
    </div>
    <span className="empty-note">.xlsx / .xls　資料只在此瀏覽器處理</span>
  </div>;
}

export default function App() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [data, setData] = useState<Analysis | null>(null);
  const [month, setMonth] = useState('all');
  const [campus, setCampus] = useState<Campus | '全部院區'>('全部院區');
  const [view, setView] = useState<View>('overview');
  const [includedCodes, setIncludedCodes] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [issueFilter, setIssueFilter] = useState('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedExecutorKey, setSelectedExecutorKey] = useState<string | null>(null);
  const [showAllDoctors, setShowAllDoctors] = useState(false);
  const [executorPage, setExecutorPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const process = async () => {
    if (busy || !files.length) return;
    setBusy(true);
    setError('');
    try {
      const { readExcelFiles } = await import('./lib/excel');
      const result = analyze(await readExcelFiles(files));
      setData(result);
      setIncludedCodes(new Set(result.drugCatalog.filter(drug => drug.kind === 'injectable-antibiotic').map(drug => drug.code)));
      setMonth(result.months.at(-1) || 'all');
      setIssueFilter('all');
      setSelectedCourseId(null);
      setSelectedExecutorKey(null);
      setExecutorPage(1);
      setSearch('');
      setPage(1);
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : '無法讀取 Excel，請檢查檔案內容');
    } finally {
      setBusy(false);
    }
  };

  const addFiles = (incoming: File[]) => {
    if (busy || !incoming.length) return;
    setFiles(previous => {
      const next = [...previous];
      incoming.forEach(file => {
        const index = next.findIndex(existing => existing.name === file.name && existing.size === file.size);
        if (index >= 0) next[index] = file;
        else next.push(file);
      });
      return next;
    });
    setData(null);
    setError('');
    setSelectedCourseId(null);
  };

  const removeFile = (index: number) => {
    if (busy) return;
    setFiles(previous => previous.filter((_, current) => current !== index));
    setData(null);
    setError('');
    setSelectedCourseId(null);
  };

  const clearFiles = () => {
    if (busy) return;
    setFiles([]);
    setData(null);
    setError('');
    setSelectedCourseId(null);
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    addFiles(Array.from(event.dataTransfer.files));
  };

  const report = useMemo(() => data ? performance(data, month, includedCodes) : [], [data, month, includedCodes]);
  const visibleReport = report.filter(row => campus === '全部院區' || row.campus === campus);
  const total = visibleReport.reduce((sum, row) => ({
    nursing: sum.nursing + row.nursing,
    pharmacy: sum.pharmacy + row.pharmacy,
    medicalAffairs: sum.medicalAffairs + row.medicalAffairs,
    totalPoints: sum.totalPoints + row.totalPoints,
  }), { nursing: 0, pharmacy: 0, medicalAffairs: 0, totalPoints: 0 });

  const events = useMemo(() => data?.executions.filter(event =>
    includedCodes.has(event.drugCode) && (month === 'all' || event.month === month) && (campus === '全部院區' || event.campus === campus),
  ) || [], [data, month, campus, includedCodes]);
  const completion = useMemo(() => data ? buildCompletion(data, includedCodes, data.snapshotDate) : null, [data, includedCodes]);
  const completionSummary = useMemo(() => completion ? summarizeCompletion(completion, month, campus) : null, [completion, month, campus]);
  const completionByCampus = useMemo(() => completion ? CAMPUSES.map(name => ({ name, ...summarizeCompletion(completion, month, name) })) : [], [completion, month]);
  const progressByCourse = useMemo(() => new Map(completion?.courses.map(item => [item.courseId, item]) || []), [completion]);
  const completionByDrug = useMemo(() => {
    const groups = new Map<string, { name: string; expected: number; executed: number }>();
    completion?.days.filter(day => (month === 'all' || day.date.startsWith(month)) && (campus === '全部院區' || day.campus === campus)).forEach(day => {
      const current = groups.get(day.drugCode) || { name: day.drugName, expected: 0, executed: 0 };
      current.expected += day.expected;
      current.executed += day.executed;
      groups.set(day.drugCode, current);
    });
    return [...groups.entries()].map(([code, result]) => ({ code, ...result })).sort((a, b) => b.expected - a.expected);
  }, [completion, month, campus]);
  const comparison = useMemo(() => data && completion ? dailyComparison(data, completion, includedCodes, month, campus) : [], [data, completion, includedCodes, month, campus]);
  const campusComparison = useMemo(() => data && completion ? CAMPUSES.map(name => ({ name, values: dailyComparison(data, completion, includedCodes, month, name) })) : [], [data, completion, includedCodes, month]);
  const completionBySource = useMemo(() => {
    const courseById = new Map(data?.courses.map(course => [course.id, course]) || []);
    return ['門診', '住院', '急診'].map(name => {
      const due = completion?.courses.filter(progress => courseById.get(progress.courseId)?.source === name &&
        (campus === '全部院區' || progress.campus === campus) &&
        (month === 'all' || progress.lastScheduledDate.startsWith(month)) &&
        (progress.status === '完成' || progress.status === '未完成')) || [];
      return { name, due: due.length, completed: due.filter(progress => progress.status === '完成').length };
    });
  }, [data, completion, month, campus]);
  const eventCourseIds = useMemo(() => new Set(events.map(event => event.courseId)), [events]);
  const courseExecCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data?.executions.filter(event => includedCodes.has(event.drugCode)).forEach(event => counts.set(event.courseId, (counts.get(event.courseId) || 0) + 1));
    return counts;
  }, [data, includedCodes]);
  const cases = useMemo(() => data?.courses.filter(course =>
    (campus === '全部院區' || course.campus === campus) &&
    (month === 'all' || course.openingMonth === month || eventCourseIds.has(course.id) ||
      (course.firstScheduledDate && course.lastScheduledDate &&
        formatDate(course.firstScheduledDate).slice(0, 7) <= month && formatDate(course.lastScheduledDate).slice(0, 7) >= month)),
  ).map(course => ({ ...course, executionCount: courseExecCounts.get(course.id) || 0 })) || [], [data, month, campus, eventCourseIds, courseExecCounts]);
  const newCases = cases.filter(course => month === 'all' || course.openingMonth === month);
  const selectedCase = cases.find(course => course.id === selectedCourseId) || null;
  const selectedCaseProgress = selectedCase ? progressByCourse.get(selectedCase.id) : null;
  const caseRows = data?.records.filter(row => row.courseId === selectedCourseId) || [];
  const caseEvents = data?.executions.filter(event => event.courseId === selectedCourseId && includedCodes.has(event.drugCode)) || [];
  const selectedIssues = data?.issues.filter(issue =>
    (campus === '全部院區' || issue.campus === campus) &&
    (issueFilter === 'all' || issue.code === issueFilter) &&
    (month === 'all' || data.records.some(row => row.id === issue.rowId && (row.times.some(time => reportingMonth(time) === month) || row.confirmDate && formatDate(row.confirmDate).startsWith(month)))),
  ) || [];

  const trend = useMemo(() => {
    const groups = new Map<string, Record<string, string | number>>();
    if (month !== 'all') {
      const [year, m] = month.split('-').map(Number);
      const days = new Date(year, m, 0).getDate();
      for (let day = 1; day <= days; day++) {
        const key = `${month}-${String(day).padStart(2, '0')}`;
        groups.set(key, { name: `${m}/${day}`, key, 新竹: 0, 竹北: 0, 竹東: 0 });
      }
    }
    events.forEach(event => {
      const key = month === 'all' ? event.month : event.date;
      const row = groups.get(key) || { name: key, key, 新竹: 0, 竹北: 0, 竹東: 0 };
      row[event.campus] = Number(row[event.campus] || 0) + 1;
      groups.set(key, row);
    });
    return [...groups.values()].sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }, [events, month]);

  const hourly = useMemo(() => hourlyByCampus(events), [events]);
  const byWeekday = useMemo(() => ['日', '一', '二', '三', '四', '五', '六'].map((day, index) => ({
    name: `週${day}`, 次數: events.filter(event => event.time.getDay() === index).length,
  })), [events]);

  const monthlyCampus = useMemo(() => data ? (month === 'all' ? data.months : [month]).flatMap(key => performance(data, key, includedCodes)
    .filter(row => campus === '全部院區' || row.campus === campus).map(row => ({ month: key, ...row }))) : [], [data, month, campus, includedCodes]);
  const bySource = useMemo(() => ['門診', '住院', '急診'].map(name => {
    const value = newCases.filter(course => course.source === name).length;
    return { name, value, label: `${number(value)} · ${percentage(newCases.length ? value / newCases.length : null)}` };
  }).filter(item => item.value > 0), [newCases]);
  const branchStatus = useMemo(() => CAMPUSES.map(name => {
    const branchCases = cases.filter(course => course.campus === name);
    return {
      name,
      courses: branchCases.length,
      executed: branchCases.filter(course => course.executionCount > 0).length,
      missed: branchCases.filter(course => courseStatus(course, data?.snapshotDate) === '未執行').length,
      pending: branchCases.filter(course => courseStatus(course, data?.snapshotDate) === '待施行' || courseStatus(course, data?.snapshotDate) === '排程中').length,
      failed: branchCases.filter(course => course.failed).length,
      transferred: branchCases.filter(course => course.transferred).length,
    };
  }), [cases, data]);
  const topDrugs = useMemo(() => {
    const groups = new Map<string, { name: string; value: number }>();
    events.forEach(event => {
      const current = groups.get(event.drugCode) || { name: event.drugName, value: 0 };
      current.value += 1;
      groups.set(event.drugCode, current);
    });
    return [...groups.values()].sort((a, b) => b.value - a.value).slice(0, 8).map(({ name, value }) => ({
      name: name.replace(/\s+\d.*$/, ''), value,
      label: `${number(value)} · ${percentage(events.length ? value / events.length : null)}`,
    }));
  }, [events]);
  const prescribing = useMemo(() => data ? prescribingMatrix(data, includedCodes, month, campus) : { drugs: [], doctors: [] }, [data, includedCodes, month, campus]);
  const byFrequency = useMemo(() => {
    const groups = new Map<string, number>();
    events.forEach(event => groups.set(event.frequency || '未填', (groups.get(event.frequency || '未填') || 0) + 1));
    return [...groups].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [events]);
  const doctorStats = useMemo(() => {
    const groups = new Map<string, { doctor: string; department: string; executions: number; cases: Set<string> }>();
    events.forEach(event => {
      const key = `${event.department}|${event.doctor}`;
      const current = groups.get(key) || { doctor: event.doctor || '未填', department: event.department || '未填', executions: 0, cases: new Set<string>() };
      current.executions += 1;
      current.cases.add(event.courseId);
      groups.set(key, current);
    });
    return [...groups.values()].sort((a, b) => b.executions - a.executions).slice(0, 12);
  }, [events]);
  const executorStats = useMemo(() => groupExecutors(events), [events]);
  const filteredExecutorStats = useMemo(() => executorStats.filter(person => !search ||
    [person.id, person.name, person.campus].some(value => value.toLowerCase().includes(search.toLowerCase()))), [executorStats, search]);
  const selectedExecutor = filteredExecutorStats.find(person => person.key === selectedExecutorKey) || filteredExecutorStats[0] || null;
  const selectedExecutorEvents = useMemo(() => selectedExecutor ? events.filter(event => executorKey(event) === selectedExecutor.key).slice().reverse() : [], [events, selectedExecutor?.key]);
  const monthlyPoints = useMemo(() => data?.months.map(key => {
    const rows = performance(data, key, includedCodes).filter(row => campus === '全部院區' || row.campus === campus);
    return { name: key, 護理: rows.reduce((sum, row) => sum + row.nursingPoints, 0), 藥劑: rows.reduce((sum, row) => sum + row.pharmacyPoints, 0), 醫事: rows.reduce((sum, row) => sum + row.medicalAffairsPoints, 0) };
  }) || [], [data, campus, includedCodes]);
  const filteredEvents = useMemo(() => events.filter(event => !search || [event.account, event.chartNo, event.drugName, event.doctor, event.executorId, event.executorName].some(field => field.toLowerCase().includes(search.toLowerCase()))).slice().reverse(), [events, search]);
  const filteredCases = useMemo(() => cases.filter(course => !search || [course.chartNo, course.accounts.join(' '), course.doctor, course.diagnosis].some(field => field.toLowerCase().includes(search.toLowerCase()))).slice().sort((a, b) => (b.openingDate?.getTime() || 0) - (a.openingDate?.getTime() || 0)), [cases, search]);
  const pageSize = 30;
  const issueCodes = data ? [...new Set(data.issues.map(issue => issue.code))].sort() : [];

  const choose = () => fileInput.current?.click();
  const switchView = (next: View) => { setView(next); setSearch(''); setPage(1); };
  const toggleDrug = (code: string) => setIncludedCodes(previous => {
    const next = new Set(previous);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    return next;
  });

  return <div className="app-shell">
    <input ref={fileInput} type="file" accept=".xlsx,.xls" multiple hidden onChange={onInput} />
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Activity size={23} strokeWidth={2.3} /></span><span><strong>OPAT</strong><small>執行與績效分析</small></span></div>
      <nav aria-label="主要導覽">{NAV.map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={`nav-item ${view === item.id ? 'active' : ''}`} onClick={() => switchView(item.id)}><Icon size={18} /><span>{item.label}</span></button>;
      })}</nav>
      <div className="sidebar-bottom"><div className="privacy"><ShieldCheck size={16} /><span>資料僅在瀏覽器內分析</span></div><small>OPAT Analysis · 2026</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="mobile-brand"><Activity size={21} /> OPAT</div><span className="topbar-title">OPAT 執行與績效分析</span><div className="topbar-actions">
        {data && completion && <button className="button ghost export-button" onClick={() => void import('./lib/excel').then(({ downloadReport }) => downloadReport(data, report, month, campus, includedCodes, completion))}><ArrowDownToLine size={17} /> 匯出 Excel 報表</button>}
        <button className="button primary" onClick={choose} disabled={busy}><Plus size={17} /> 新增 Excel</button>
      </div></header>
      <div className="mobile-nav">{NAV.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => switchView(item.id)}>{item.label}</button>)}</div>
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">OPAT REPORTING</p><h1>{NAV.find(item => item.id === view)?.label}</h1><p className="page-subtitle">{data ? `已載入 ${number(data.records.length)} 筆原始資料、${number(data.courses.length)} 個療程 · 資料快照 ${formatDate(data.snapshotDate)}${data.snapshotSource === 'system' ? '（系統日期）' : ''}` : '匯入原始個案資料後即可檢視分析'}</p></div>
          {data && <div className="filters"><label><span>績效月份</span><select value={month} onChange={event => { setMonth(event.target.value); setPage(1); }}><option value="all">全部期間</option>{data.months.map(key => <option key={key} value={key}>{key}</option>)}</select><ChevronDown size={15} /></label><label><span>院區</span><select value={campus} onChange={event => { setCampus(event.target.value as Campus | '全部院區'); setPage(1); }}><option>全部院區</option>{CAMPUSES.map(name => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></label></div>}
        </div>

        {error && <div className="error-banner"><AlertTriangle size={18} />{error}<button onClick={() => setError('')} aria-label="關閉錯誤"><X size={16} /></button></div>}
        {data?.snapshotWarning && <div className="error-banner"><AlertTriangle size={18} />{data.snapshotWarning}</div>}
        {busy && <div className="loading"><span className="spinner" /> 正在解析 Excel 與計算報表…</div>}
        {files.length > 0 && <div className="file-strip" onDragOver={event => event.preventDefault()} onDrop={onDrop}><FileSpreadsheet size={17} /><span>已加入 {files.length} 個檔案</span>{files.map((file, index) => <span className="file-chip" key={`${file.name}-${index}`}><span title={file.name}>{file.name}</span><button title={`移除 ${file.name}`} aria-label={`移除 ${file.name}`} disabled={busy} onClick={() => removeFile(index)}><X size={13} /></button></span>)}<button className="text-button" disabled={busy} onClick={clearFiles}><Trash2 size={14} /> 清除</button></div>}

        {!data && !busy && <EmptyState fileCount={files.length} onChoose={choose} onAnalyze={() => void process()} onDrop={onDrop} />}
        {data && <>
          {view === 'overview' && <>
            <div className="stats-grid">
              {statLine('本期新開療程', number(newCases.length), '#087c72', Users)}
              {statLine('注射抗生素施打', number(total.nursing), '#e57443', Activity)}
              {statLine('藥品保管筆數', number(total.pharmacy), '#8b65a3', Pill)}
              {statLine('管理費申報', number(total.medicalAffairs), '#d6a637', ClipboardList)}
            </div>
            <Section title="執行完成率" detail={`依檔名下載日 ${formatDate(data.snapshotDate)} 判定；僅統計截至 ${completion?.asOf || '—'} 的排程，中斷或轉診及資料不足者不列入分母。`}>
              <div className="stats-grid completion-stats">
                {statLine('預定施打', number(completionSummary?.expected || 0), '#087c72', ClipboardList)}
                {statLine('已完成施打', number(completionSummary?.executed || 0), '#e57443', Activity)}
                {statLine('施打完成率', percentage(completionSummary?.doseRate ?? null), '#8b65a3', Check)}
                {statLine('到期療程完成率', percentage(completionSummary?.courseRate ?? null), '#d6a637', ShieldCheck)}
              </div>
              <div className="table-scroll"><table><thead><tr><th>院區</th><th className="numeric">預定施打</th><th className="numeric">已完成</th><th className="numeric">未完成</th><th>施打完成率</th><th className="numeric">到期療程</th><th className="numeric">完成療程</th><th>療程完成率</th></tr></thead><tbody>{completionByCampus.filter(row => campus === '全部院區' || row.name === campus).map(row => <tr key={row.name}><td className="emph">{row.name}</td><td className="numeric">{number(row.expected)}</td><td className="numeric">{number(row.executed)}</td><td className="numeric">{number(row.missed)}</td><td><div className="rate-cell"><strong>{percentage(row.doseRate)}</strong><meter min="0" max="1" value={row.doseRate || 0} aria-label={`${row.name}施打完成率`} /></div></td><td className="numeric">{number(row.dueCourses)}</td><td className="numeric">{number(row.completedCourses)}</td><td><div className="rate-cell"><strong>{percentage(row.courseRate)}</strong><meter min="0" max="1" value={row.courseRate || 0} aria-label={`${row.name}療程完成率`} /></div></td></tr>)}</tbody></table></div>
              {(completionSummary?.interruptedCourses || completionSummary?.unknownCourses) ? <p className="method-note">另有中斷／轉診 {number(completionSummary?.interruptedCourses || 0)} 療程、排程資料不足 {number(completionSummary?.unknownCourses || 0)} 療程，未列入到期療程完成率。</p> : null}
            </Section>
            <div className="two-column wide-left">
              <Section title={month === 'all' ? '每月預定與實際施打' : '每日預定與實際施打'} detail="單柱呈現預定內完成、未完成及未對應排程；截至資料快照前一天"><ComparisonChart values={comparison} /><p className="method-note">未對應排程：有施打明細，但同療程、同藥品、同日期找不到可評估的預定施打；不代表一定多打。</p></Section>
              <Section title="療程來源完成率" detail="依最後預定日期歸月；不含中斷、轉診與資料不足"><div className="table-scroll"><table><thead><tr><th>來源</th><th className="numeric">到期</th><th className="numeric">完成</th><th className="numeric">未完成</th><th>完成率</th></tr></thead><tbody>{completionBySource.map(row => <tr key={row.name}><td className="emph">{row.name}</td><td className="numeric">{number(row.due)}</td><td className="numeric">{number(row.completed)}</td><td className="numeric">{number(row.due - row.completed)}</td><td><div className="rate-cell"><strong>{percentage(row.due ? row.completed / row.due : null)}</strong><meter min="0" max="1" value={row.due ? row.completed / row.due : 0} aria-label={`${row.name}療程完成率`} /></div></td></tr>)}</tbody></table></div></Section>
            </div>
            {campus === '全部院區' && <Section title="各院區預定與實際施打" detail="三院區各自呈現，預定與實際可直接比較"><div className="campus-comparisons">{campusComparison.map(item => <div key={item.name} className="campus-comparison"><h3>{item.name}</h3><ComparisonChart values={item.values} /></div>)}</div></Section>}
            <div className="two-column wide-left trend-row">
              <Section title={month === 'all' ? '每月執行趨勢' : '每日執行趨勢'} detail="月份於 08:00 切分；每日圖使用實際施打日期">
                <ExecutionTrend values={trend} campus={campus} empty={!events.length} />
              </Section>
              <Section title="各院區執行量" detail="依績效月份與院區列示">
                <div className="table-scroll"><table><thead><tr><th>月份</th><th>院區</th><th className="numeric">護理施打</th><th className="numeric">藥劑保管</th><th className="numeric">管理費</th></tr></thead><tbody>{monthlyCampus.map(row => <tr key={`${row.month}-${row.campus}`}><td>{row.month}</td><td className="emph">{row.campus}</td><td className="numeric">{number(row.nursing)}</td><td className="numeric">{number(row.pharmacy)}</td><td className="numeric">{number(row.medicalAffairs)}</td></tr>)}</tbody></table></div>
              </Section>
            </div>
            <div className="two-column">
              <Section title="療程來源" detail="標示新開療程數及占比；D1 與 D2-D7 合併"><RankedBars values={bySource} color={COLORS[1]} axisWidth={75} /></Section>
              <Section title="常用注射抗生素" detail="施打次數及占本範圍全部注射抗生素施打比例"><RankedBars values={topDrugs} color={COLORS[0]} axisWidth={110} /></Section>
            </div>
            <Section title="院區療程狀況" detail={`以 ${formatDate(data.snapshotDate)} 資料快照判定；失敗與轉診另外列示`}><div className="table-scroll"><table><thead><tr><th>院區</th><th className="numeric">療程</th><th className="numeric">有執行</th><th className="numeric">未執行</th><th className="numeric">待施行</th><th className="numeric">失敗標記</th><th className="numeric">轉急診/住院</th></tr></thead><tbody>{branchStatus.map(row => <tr key={row.name}><td className="emph">{row.name}</td><td className="numeric">{row.courses}</td><td className="numeric">{row.executed}</td><td className="numeric">{row.missed}</td><td className="numeric">{row.pending}</td><td className="numeric">{row.failed}</td><td className="numeric">{row.transferred}</td></tr>)}</tbody></table></div></Section>
            <div className="insight-row"><div><strong>{number(cases.filter(course => course.failed).length)}</strong><span>標記失敗個案</span></div><div><strong>{number(cases.filter(course => course.transferred).length)}</strong><span>轉急診 / 住院</span></div><div><strong>{number(cases.filter(course => course.accounts.length > 1).length)}</strong><span>合併的 D1 / D2 療程</span></div><div><strong>{number(selectedIssues.length)}</strong><span>待檢核項目</span></div><button onClick={() => switchView('audit')}>查看資料檢核 →</button></div>
          </>}

          {view === 'execution' && <>
            <div className="stats-grid three">
              {statLine('施打總次數', number(events.length), '#087c72', Activity)}
              {statLine('有施打的療程', number(new Set(events.map(event => event.courseId)).size), '#e57443', Users)}
              {statLine('注射藥品種類', number(new Set(events.map(event => event.drugCode)).size), '#8b65a3', Pill)}
            </div>
            <div className="two-column wide-left trend-row">
              <Section title={month === 'all' ? '每月施打次數' : '每日施打次數'}><ExecutionTrend values={trend} campus={campus} empty={!events.length} /></Section>
              <Section title="施打時段" detail="實際時間，以整點分組；三院區堆疊並使用相同刻度各自比較"><HourlyDistribution values={hourly} campus={campus} empty={!events.length} /></Section>
            </div>
            <div className="two-column"><Section title="藥品施打排行" detail="施打次數及占本範圍全部注射抗生素施打比例"><RankedBars values={topDrugs} color={COLORS[0]} axisWidth={110} /></Section><Section title="醫令頻率"><Chart empty={!byFrequency.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={byFrequency} layout="vertical" margin={{ top: 16, right: 18, left: 0, bottom: 8 }}><CartesianGrid stroke="#e8eded" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={68} /><Tooltip /><Bar dataKey="value" name="施打次數" fill={COLORS[2]} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></Chart></Section></div>
            <div className="two-column"><Section title="星期分布" detail="實際施打時間"><Chart empty={!events.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={byWeekday} margin={{ top: 12, right: 10, left: -22, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="次數" fill={COLORS[4]} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></Chart></Section><Section title="各藥品預定施打完成" detail="排程日與實際施打時間比對"><div className="table-scroll"><table><thead><tr><th>藥品</th><th className="numeric">預定</th><th className="numeric">完成</th><th className="numeric">未完成</th><th>完成率</th></tr></thead><tbody>{completionByDrug.slice(0, 12).map(drug => <tr key={drug.code}><td title={drug.name}>{drug.name}</td><td className="numeric">{number(drug.expected)}</td><td className="numeric">{number(drug.executed)}</td><td className="numeric">{number(drug.expected - drug.executed)}</td><td className="emph">{percentage(drug.expected ? drug.executed / drug.expected : null)}</td></tr>)}</tbody></table></div></Section></div>
            <Section title="醫師抗生素開立偏好" detail="依療程開案月份；各格為開立此藥的療程數，占該醫師 OPAT 療程數的比例"
              action={prescribing.doctors.length > 15 ? <button className="button ghost" onClick={() => setShowAllDoctors(value => !value)}>{showAllDoctors ? '顯示前 15 位' : `顯示全部 ${number(prescribing.doctors.length)} 位`}</button> : undefined}>
              {prescribing.doctors.length && prescribing.drugs.length ? <div className="table-scroll prescribing-scroll"><table className="prescribing-table"><thead><tr><th className="doctor-column">醫師</th><th>院區</th><th className="numeric">OPAT 療程</th>{prescribing.drugs.map(drug => <th key={drug.code} title={drug.name}><span>{drug.name.replace(/\s+\d.*$/, '')}</span><small>{drug.code}</small></th>)}</tr></thead><tbody>{prescribing.doctors.slice(0, showAllDoctors ? undefined : 15).map(doctor => <tr key={doctor.key}><td className="doctor-column"><strong>{doctor.doctor}</strong><small>{doctor.department || '科別未填'}</small></td><td>{doctor.campus}</td><td className="numeric emph">{number(doctor.courses)}</td>{prescribing.drugs.map(drug => { const entry = doctor.byDrug[drug.code]; return <td key={drug.code} className="heat-td">{entry ? <span className="heat-cell" style={{ backgroundColor: `rgba(8, 124, 114, ${0.08 + entry.rate * 0.44})` }} title={`${doctor.doctor}：${drug.name}，${entry.courses} / ${doctor.courses} 療程`}><strong>{percentage(entry.rate)}</strong><small>{entry.courses} / {doctor.courses}</small></span> : <span className="heat-empty">—</span>}</td>; })}</tr>)}</tbody></table></div> : <div className="chart-empty heat-empty-state">此範圍沒有可分析的醫師與注射抗生素開立資料</div>}
              <p className="method-note">每個療程對每種藥只計一次；同一療程可能開立多種抗生素，因此各藥比例不一定合計 100%。</p>
            </Section>
            <Section title="科別與醫師" detail="依施打次數排序"><div className="table-scroll"><table><thead><tr><th>科別</th><th>醫師</th><th className="numeric">療程數</th><th className="numeric">施打次數</th></tr></thead><tbody>{doctorStats.map((item, index) => <tr key={index}><td>{item.department}</td><td>{item.doctor}</td><td className="numeric">{number(item.cases.size)}</td><td className="numeric emph">{number(item.executions)}</td></tr>)}</tbody></table></div></Section>
            <Section title="施打紀錄" detail={`共 ${number(filteredEvents.length)} 次`} action={<div className="search"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="帳號、病歷號、藥品、醫師、人員" /></div>}><div className="table-scroll"><table><thead><tr><th>執行時間</th><th>績效月</th><th>院區</th><th>執行人員</th><th>人員代碼</th><th>帳號</th><th>病歷號</th><th>注射抗生素</th><th>頻率</th><th>來源列</th></tr></thead><tbody>{filteredEvents.slice((page - 1) * pageSize, page * pageSize).map(event => <tr key={event.id}><td className="nowrap">{formatDate(event.time, true)}</td><td>{event.month}</td><td>{event.campus}</td><td>{event.executorName || '未記錄'}</td><td className="mono">{event.executorId || '—'}</td><td className="mono">{event.account}</td><td className="mono">{event.chartNo}</td><td>{event.drugName}</td><td>{event.frequency}</td><td className="mono">{event.rowId}</td></tr>)}</tbody></table></div><Pagination page={page} total={filteredEvents.length} size={pageSize} onChange={setPage} /></Section>
          </>}

          {view === 'staff' && <>
            <div className="stats-grid three">
              {statLine('有紀錄執行人員', number(executorStats.filter(person => person.name !== '未記錄').length), '#087c72', Users)}
              {statLine('可追溯施打', number(events.filter(event => event.executorName).length), '#e57443', Activity)}
              {statLine('施打病人數', number(new Set(events.map(event => `${event.campus}|${event.chartNo}`)).size), '#8b65a3', Stethoscope)}
            </div>
            <Section title="人員施打量" detail="依實際施打次數排序"><Chart empty={!executorStats.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={executorStats.slice(0, 12)} layout="vertical" margin={{ top: 2, right: 18, left: 8, bottom: 2 }}><CartesianGrid stroke="#e8eded" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="executions" name="施打次數" fill={COLORS[0]} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></Chart></Section>
            <Section title="執行人員統計" detail={`共 ${number(filteredExecutorStats.length)} 位／組`} action={<div className="search"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); setExecutorPage(1); }} placeholder="姓名、人員代碼、院區" /></div>}><div className="table-scroll"><table><thead><tr><th>執行人員</th><th>人員代碼</th><th>院區</th><th className="numeric">施打次數</th><th className="numeric">病人數</th><th className="numeric">療程數</th><th className="numeric">藥品種類</th><th>首次施打</th><th>最後施打</th></tr></thead><tbody>{filteredExecutorStats.slice((page - 1) * pageSize, page * pageSize).map(person => <tr key={person.key} className={selectedExecutor?.key === person.key ? 'selected-row' : ''}><td><button className="table-link" onClick={() => { setSelectedExecutorKey(person.key); setExecutorPage(1); }}>{person.name}</button></td><td className="mono">{person.id || '—'}</td><td>{person.campus}</td><td className="numeric emph">{number(person.executions)}</td><td className="numeric">{number(person.patients)}</td><td className="numeric">{number(person.courses)}</td><td className="numeric">{number(person.drugs)}</td><td className="nowrap">{formatDate(person.first, true)}</td><td className="nowrap">{formatDate(person.last, true)}</td></tr>)}</tbody></table></div><Pagination page={page} total={filteredExecutorStats.length} size={pageSize} onChange={setPage} /></Section>
            {selectedExecutor && <Section title={`${selectedExecutor.name}的施打明細`} detail={`${selectedExecutor.campus} · ${selectedExecutor.id || '人員代碼未記錄'} · 共 ${number(selectedExecutorEvents.length)} 次`}><div className="table-scroll"><table><thead><tr><th>執行時間</th><th>帳號</th><th>病歷號</th><th>診療行為</th><th>注射抗生素</th><th>科別</th><th>看診醫師</th><th>來源列</th></tr></thead><tbody>{selectedExecutorEvents.slice((executorPage - 1) * pageSize, executorPage * pageSize).map(event => <tr key={event.id}><td className="nowrap">{formatDate(event.time, true)}</td><td className="mono">{event.account}</td><td className="mono">{event.chartNo}</td><td>{event.treatment}</td><td>{event.drugName}</td><td>{event.department}</td><td>{event.doctor}</td><td className="mono">{event.rowId}</td></tr>)}</tbody></table></div><Pagination page={executorPage} total={selectedExecutorEvents.length} size={pageSize} onChange={setExecutorPage} /></Section>}
          </>}

          {view === 'performance' && <>
            <div className="stats-grid three">
              {statLine('護理點數', number(total.nursing * POINTS.nursing, 2), '#087c72', Activity)}
              {statLine('藥劑點數', number(total.pharmacy * POINTS.pharmacy, 2), '#e57443', Pill)}
              {statLine('醫事點數', number(total.medicalAffairs * POINTS.medicalAffairs, 2), '#8b65a3', ClipboardList)}
            </div>
            <Section title="各職類績效" detail="施打與藥品保管按 08:00 切月；無執行時間的管理費依確認日期歸月"><div className="table-scroll"><table className="performance-table"><thead><tr><th>院區</th><th className="numeric">原始施打</th><th className="numeric">排除重複/超頻</th><th className="numeric">護理次數</th><th className="numeric">護理點數</th><th className="numeric">藥劑筆數</th><th className="numeric">藥劑點數</th><th className="numeric">管理費申報</th><th className="numeric">醫事點數</th><th className="numeric">總點數</th></tr></thead><tbody>{visibleReport.map(row => <tr key={row.campus}><td className="emph">{row.campus}</td><td className="numeric">{number(row.rawNursing)}</td><td className="numeric">{number(row.excludedNursing)}</td><td className="numeric">{number(row.nursing)}</td><td className="numeric">{number(row.nursingPoints, 2)}</td><td className="numeric">{number(row.pharmacy)}</td><td className="numeric">{number(row.pharmacyPoints, 2)}</td><td className="numeric">{number(row.medicalAffairs)}</td><td className="numeric">{number(row.medicalAffairsPoints, 3)}</td><td className="numeric emph">{number(row.totalPoints, 3)}</td></tr>)}</tbody><tfoot><tr><td>合計</td><td className="numeric">{number(visibleReport.reduce((sum, row) => sum + row.rawNursing, 0))}</td><td className="numeric">{number(visibleReport.reduce((sum, row) => sum + row.excludedNursing, 0))}</td><td className="numeric">{number(total.nursing)}</td><td className="numeric">{number(total.nursing * POINTS.nursing, 2)}</td><td className="numeric">{number(total.pharmacy)}</td><td className="numeric">{number(total.pharmacy * POINTS.pharmacy, 2)}</td><td className="numeric">{number(total.medicalAffairs)}</td><td className="numeric">{number(total.medicalAffairs * POINTS.medicalAffairs, 3)}</td><td className="numeric">{number(total.totalPoints, 3)}</td></tr></tfoot></table></div><p className="method-note">原始施打保留來源明細供對帳；護理點數採排除相同療程、藥品、時間與超過頻率上限後的有效施打。</p></Section>
            <div className="two-column wide-left"><Section title="每月點數趨勢"><Chart empty={!monthlyPoints.length}><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyPoints} margin={{ top: 12, right: 14, left: -15, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" minTickGap={16} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Area dataKey="護理" stackId="a" stroke={COLORS[0]} fill={COLORS[0]} /><Area dataKey="藥劑" stackId="a" stroke={COLORS[1]} fill={COLORS[1]} /><Area dataKey="醫事" stackId="a" stroke={COLORS[2]} fill={COLORS[2]} /></AreaChart></ResponsiveContainer></Chart></Section><Section title="計算依據"><div className="rules"><div><Activity size={19} /><strong>護理</strong><span>注射抗生素逐次執行 × 0.1 點</span></div><div><Pill size={19} /><strong>藥劑</strong><span>有執行的藥品原始列 × 0.05 點</span></div><div><ClipboardList size={19} /><strong>醫事</strong><span>非 D1 帳號管理費申報 × 0.025 點</span></div><p>相同療程、藥品、時間只計一次施打；跨月原始列在各有執行的月份各計一筆保管。</p></div></Section></div>
          </>}

          {view === 'cases' && <>
            <div className="stats-grid">{statLine('範圍內療程', number(cases.length), '#087c72', Users)}{statLine('有施打紀錄', number(cases.filter(course => course.executionCount > 0).length), '#e57443', Stethoscope)}{statLine('到期完成療程', number(completionSummary?.completedCourses || 0), '#8b65a3', Check)}{statLine('排程資料不足', number(completionSummary?.unknownCourses || 0), '#d6a637', AlertTriangle)}</div>
            <Section title="療程清單" detail="門診 D1 與 D2-D7 依同院區病歷號及相近開案日期合併" action={<div className="search"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="帳號、病歷號、醫師、診斷" /></div>}><div className="table-scroll"><table><thead><tr><th>開案日期</th><th>院區</th><th>病歷號</th><th>帳號</th><th>來源</th><th>主診斷</th><th className="numeric">施打</th><th className="numeric">預定</th><th className="numeric">申報</th><th>療程狀態</th></tr></thead><tbody>{filteredCases.slice((page - 1) * pageSize, page * pageSize).map(course => { const progress = progressByCourse.get(course.id); return <tr key={course.id} className="clickable" onClick={() => setSelectedCourseId(course.id)}><td>{formatDate(course.openingDate)}</td><td>{course.campus}</td><td className="mono">{course.chartNo}</td><td className="mono accounts-cell">{course.accounts.join(' / ')}</td><td>{course.source}</td><td>{course.diagnosis || '—'}</td><td className="numeric">{number(course.executionCount)}</td><td className="numeric">{progress ? number(progress.expected) : '—'}</td><td className="numeric">{number(course.feeCount)}</td><td><span className={`status ${progress?.status === '未完成' || progress?.status === '中斷/轉診' ? 'danger' : progress?.status === '完成' ? 'good' : 'neutral'}`}>{progress?.status || courseStatus(course, data.snapshotDate)}</span></td></tr>; })}</tbody></table></div><Pagination page={page} total={filteredCases.length} size={pageSize} onChange={setPage} /></Section>
          </>}

          {view === 'audit' && <>
            <div className="stats-grid three">{statLine('待檢核項目', number(selectedIssues.length), '#e57443', AlertTriangle)}{statLine('重複施打紀錄', number(selectedIssues.filter(issue => issue.code === 'duplicate').length), '#8b65a3', Filter)}{statLine('退量與執行並存', number(selectedIssues.filter(issue => issue.code === 'refund-execution').length), '#087c72', Check)}</div>
            <Section title="藥品分類" detail="預設只納入已確認的注射抗生素；新藥品可在此勾選納入護理與藥劑計算"><div className="drug-list">{data.drugCatalog.map(drug => <label className="drug-item" key={drug.code || drug.name}><input type="checkbox" checked={includedCodes.has(drug.code)} onChange={() => toggleDrug(drug.code)} /><span className="drug-check"><Check size={13} /></span><span className="drug-main"><strong>{drug.name}</strong><small>{drug.code || '無藥品碼'} · {number(drug.rows)} 列</small></span><span className={`kind kind-${drug.kind}`}>{drug.kind === 'injectable-antibiotic' ? '注射抗生素' : drug.kind === 'diluent' ? '稀釋液' : drug.kind === 'review' ? '待確認' : '其他藥品'}</span></label>)}</div></Section>
            <Section title="異常與核對" detail={`共 ${number(selectedIssues.length)} 項；來源列可與原始 Excel 比對`} action={<label className="issue-select"><select value={issueFilter} onChange={event => { setIssueFilter(event.target.value); setPage(1); }}><option value="all">全部類型</option>{issueCodes.map(code => <option key={code}>{code}</option>)}</select><ChevronDown size={15} /></label>}><div className="table-scroll"><table><thead><tr><th>類型</th><th>院區</th><th>帳號</th><th>說明</th><th>來源列</th></tr></thead><tbody>{selectedIssues.slice((page - 1) * pageSize, page * pageSize).map((issue: DataIssue, index) => <tr key={`${issue.rowId}-${issue.code}-${index}`}><td><span className={`status ${issue.level === 'warning' ? 'neutral' : 'danger'}`}>{issue.code}</span></td><td>{issue.campus}</td><td className="mono">{issue.account}</td><td>{issue.message}</td><td className="mono">{data.records.find(row => row.id === issue.rowId)?.file}　#{data.records.find(row => row.id === issue.rowId)?.rowNumber}</td></tr>)}</tbody></table></div><Pagination page={page} total={selectedIssues.length} size={pageSize} onChange={setPage} /></Section>
          </>}
        </>}
      </div>
    </main>

    {selectedCase && <div className="drawer-backdrop" onClick={() => setSelectedCourseId(null)}><aside className="drawer" onClick={event => event.stopPropagation()}>
      <div className="drawer-head"><div><small>療程明細</small><h2>{selectedCase.chartNo}</h2></div><button aria-label="關閉明細" onClick={() => setSelectedCourseId(null)}><X size={20} /></button></div>
      <div className="drawer-body"><dl>
        <div><dt>院區</dt><dd>{selectedCase.campus}</dd></div><div><dt>來源</dt><dd>{selectedCase.source}</dd></div>
        <div><dt>開案日期</dt><dd>{formatDate(selectedCase.openingDate)}</dd></div><div><dt>醫師</dt><dd>{selectedCase.doctor || '—'}</dd></div>
        <div><dt>帳號</dt><dd className="mono">{selectedCase.accounts.join(' / ')}</dd></div><div><dt>主診斷</dt><dd>{selectedCase.diagnosis || '—'}</dd></div>
        <div><dt>施打次數</dt><dd>{selectedCase.executionCount}</dd></div><div><dt>到期預定施打</dt><dd>{selectedCaseProgress?.expected ?? '—'}</dd></div>
        <div><dt>排程對應施打</dt><dd>{selectedCaseProgress?.executed ?? '—'}</dd></div><div><dt>療程完成狀態</dt><dd>{selectedCaseProgress?.status || '無注射抗生素排程'}</dd></div>
        <div><dt>管理費申報</dt><dd>{selectedCase.feeCount}</dd></div><div><dt>轉急診日</dt><dd>{formatDate(selectedCase.transferEmergency)}</dd></div>
        <div><dt>轉住院日</dt><dd>{formatDate(selectedCase.transferHospital)}</dd></div>
      </dl><h3>施打時間與人員</h3><div className="drawer-list">{caseEvents.length ? caseEvents.map(event => <div key={event.id}><time>{formatDate(event.time, true)}</time><span>{event.drugName}<small>{event.executorName || '人員未記錄'} {event.executorId}</small></span></div>) : <p>無注射抗生素施打紀錄</p>}</div>
      <h3>原始資料列</h3><div className="drawer-list">{caseRows.map(row => <div key={row.id}><time>{row.file} #{row.rowNumber}</time><span>{row.treatment} · {row.drugName}</span></div>)}</div></div>
    </aside></div>}
  </div>;
}

function Pagination({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return <div className="pagination"><span>{number(total)} 筆 · 第 {page} / {pages} 頁</span><div><button disabled={page <= 1} onClick={() => onChange(page - 1)}>上一頁</button><button disabled={page >= pages} onClick={() => onChange(page + 1)}>下一頁</button></div></div>;
}
