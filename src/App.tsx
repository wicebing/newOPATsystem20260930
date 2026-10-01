import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownToLine, Check, ChevronDown, ClipboardList,
  FileSpreadsheet, Filter, FolderOpen, LayoutDashboard, Pill, Plus, Search,
  ShieldCheck, Stethoscope, Trash2, UploadCloud, Users, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  analyze, CAMPUSES, courseStatus, formatDate, performance, POINTS, reportingMonth,
} from './lib/opat';
import type { Analysis, Campus, DataIssue } from './lib/opat';

type View = 'overview' | 'execution' | 'performance' | 'cases' | 'audit';
const COLORS = ['#087c72', '#e57443', '#8b65a3', '#d6a637', '#5c92b3', '#9ba8a4'];
const NAV: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '總覽', icon: LayoutDashboard },
  { id: 'execution', label: '執行分析', icon: Activity },
  { id: 'performance', label: '績效點數', icon: ClipboardList },
  { id: 'cases', label: '個案明細', icon: Users },
  { id: 'audit', label: '資料檢核', icon: ShieldCheck },
];

function number(value: number, decimals = 0) {
  return value.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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

function EmptyState({ onChoose, onDrop }: { onChoose: () => void; onDrop: (event: DragEvent<HTMLDivElement>) => void }) {
  return <div className="empty-state" onDragOver={event => event.preventDefault()} onDrop={onDrop}>
    <div className="empty-icon"><FileSpreadsheet size={32} strokeWidth={1.5} /></div>
    <h2>匯入 OPAT 個案資料</h2>
    <p>可同時選取 g、h 原始 Excel 檔；院區與多檔資料會自動整合。</p>
    <button className="primary-button" onClick={onChoose}><FolderOpen size={18} /> 選擇 Excel 檔案</button>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const process = async (nextFiles: File[]) => {
    setFiles(nextFiles);
    if (!nextFiles.length) {
      setData(null);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { readExcelFiles } = await import('./lib/excel');
      const result = analyze(await readExcelFiles(nextFiles));
      setData(result);
      setIncludedCodes(new Set(result.drugCatalog.filter(drug => drug.kind === 'injectable-antibiotic').map(drug => drug.code)));
      setMonth(result.months.at(-1) || 'all');
      setIssueFilter('all');
      setSelectedCourseId(null);
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
    const next = [...files];
    incoming.forEach(file => {
      const index = next.findIndex(existing => existing.name === file.name && existing.size === file.size);
      if (index >= 0) next[index] = file;
      else next.push(file);
    });
    void process(next);
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
  const eventCourseIds = useMemo(() => new Set(events.map(event => event.courseId)), [events]);
  const courseExecCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data?.executions.filter(event => includedCodes.has(event.drugCode)).forEach(event => counts.set(event.courseId, (counts.get(event.courseId) || 0) + 1));
    return counts;
  }, [data, includedCodes]);
  const cases = useMemo(() => data?.courses.filter(course =>
    (campus === '全部院區' || course.campus === campus) &&
    (month === 'all' || course.openingMonth === month || eventCourseIds.has(course.id)),
  ).map(course => ({ ...course, executionCount: courseExecCounts.get(course.id) || 0 })) || [], [data, month, campus, eventCourseIds, courseExecCounts]);
  const newCases = cases.filter(course => month === 'all' || course.openingMonth === month);
  const selectedCase = cases.find(course => course.id === selectedCourseId) || null;
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

  const hourly = useMemo(() => Array.from({ length: 24 }, (_, hour) => ({
    name: `${String(hour).padStart(2, '0')}:00`,
    次數: events.filter(event => event.time.getHours() === hour).length,
  })), [events]);

  const byCampus = useMemo(() => CAMPUSES.map(name => ({ name, 護理: report.find(row => row.campus === name)?.nursing || 0, 藥劑: report.find(row => row.campus === name)?.pharmacy || 0, 醫事: report.find(row => row.campus === name)?.medicalAffairs || 0 })), [report]);
  const bySource = useMemo(() => ['門診', '住院', '回院/其他'].map(name => ({ name, value: newCases.filter(course => course.source === name).length })).filter(item => item.value > 0), [newCases]);
  const branchStatus = useMemo(() => CAMPUSES.map(name => {
    const branchCases = cases.filter(course => course.campus === name);
    return {
      name,
      courses: branchCases.length,
      executed: branchCases.filter(course => course.executionCount > 0).length,
      missed: branchCases.filter(course => courseStatus(course) === '未執行').length,
      pending: branchCases.filter(course => courseStatus(course) === '待施行' || courseStatus(course) === '排程中').length,
      failed: branchCases.filter(course => course.failed).length,
      transferred: branchCases.filter(course => course.transferred).length,
    };
  }), [cases]);
  const topDrugs = useMemo(() => {
    const groups = new Map<string, number>();
    events.forEach(event => groups.set(event.drugName, (groups.get(event.drugName) || 0) + 1));
    return [...groups].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name: name.replace(/\s+\d.*$/, ''), value }));
  }, [events]);
  const byFrequency = useMemo(() => {
    const groups = new Map<string, number>();
    events.forEach(event => groups.set(event.frequency || '未填', (groups.get(event.frequency || '未填') || 0) + 1));
    return [...groups].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  }, [events]);
  const staffStats = useMemo(() => {
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
  const monthlyPoints = useMemo(() => data?.months.map(key => {
    const rows = performance(data, key, includedCodes).filter(row => campus === '全部院區' || row.campus === campus);
    return { name: key, 護理: rows.reduce((sum, row) => sum + row.nursingPoints, 0), 藥劑: rows.reduce((sum, row) => sum + row.pharmacyPoints, 0), 醫事: rows.reduce((sum, row) => sum + row.medicalAffairsPoints, 0) };
  }) || [], [data, campus, includedCodes]);
  const filteredEvents = useMemo(() => events.filter(event => !search || [event.account, event.chartNo, event.drugName, event.doctor].some(field => field.toLowerCase().includes(search.toLowerCase()))).slice().reverse(), [events, search]);
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
        {data && <button className="button ghost export-button" onClick={() => void import('./lib/excel').then(({ downloadReport }) => downloadReport(data, report, month, campus, includedCodes))}><ArrowDownToLine size={17} /> 匯出報表</button>}
        <button className="button primary" onClick={choose}><Plus size={17} /> 匯入 Excel</button>
      </div></header>
      <div className="mobile-nav">{NAV.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} onClick={() => switchView(item.id)}>{item.label}</button>)}</div>
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">OPAT REPORTING</p><h1>{NAV.find(item => item.id === view)?.label}</h1><p className="page-subtitle">{data ? `已載入 ${number(data.records.length)} 筆原始資料、${number(data.courses.length)} 個療程` : '匯入原始個案資料後即可檢視分析'}</p></div>
          {data && <div className="filters"><label><span>績效月份</span><select value={month} onChange={event => { setMonth(event.target.value); setPage(1); }}><option value="all">全部期間</option>{data.months.map(key => <option key={key} value={key}>{key}</option>)}</select><ChevronDown size={15} /></label><label><span>院區</span><select value={campus} onChange={event => { setCampus(event.target.value as Campus | '全部院區'); setPage(1); }}><option>全部院區</option>{CAMPUSES.map(name => <option key={name}>{name}</option>)}</select><ChevronDown size={15} /></label></div>}
        </div>

        {error && <div className="error-banner"><AlertTriangle size={18} />{error}<button onClick={() => setError('')} aria-label="關閉錯誤"><X size={16} /></button></div>}
        {busy && <div className="loading"><span className="spinner" /> 正在解析 Excel 與計算報表…</div>}
        {files.length > 0 && <div className="file-strip"><FileSpreadsheet size={17} /><span>資料來源</span>{files.map((file, index) => <span className="file-chip" key={`${file.name}-${index}`}>{file.name}<button title={`移除 ${file.name}`} aria-label={`移除 ${file.name}`} onClick={() => void process(files.filter((_, i) => i !== index))}><X size={13} /></button></span>)}<button className="text-button" onClick={() => void process([])}><Trash2 size={14} /> 清除</button></div>}

        {!data && !busy && <EmptyState onChoose={choose} onDrop={onDrop} />}
        {data && <>
          {view === 'overview' && <>
            <div className="stats-grid">
              {statLine('本期新開療程', number(newCases.length), '#087c72', Users)}
              {statLine('注射抗生素施打', number(total.nursing), '#e57443', Activity)}
              {statLine('藥品保管筆數', number(total.pharmacy), '#8b65a3', Pill)}
              {statLine('管理費申報', number(total.medicalAffairs), '#d6a637', ClipboardList)}
            </div>
            <div className="two-column wide-left">
              <Section title={month === 'all' ? '每月執行趨勢' : '每日執行趨勢'} detail="月份於 08:00 切分；每日圖使用實際施打日期">
                <Chart empty={!events.length}><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 14, left: -24, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} minTickGap={25} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} /><Tooltip content={<TooltipContent />} /><Legend />{CAMPUSES.filter(name => campus === '全部院區' || campus === name).map((name, i) => <Area key={name} dataKey={name} stackId="a" stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.8} />)}</AreaChart></ResponsiveContainer></Chart>
              </Section>
              <Section title="各院區執行量" detail="護理施打、藥劑保管、管理費申報">
                <Chart empty={!events.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={byCampus} layout="vertical" margin={{ top: 8, right: 12, left: 3, bottom: 0 }}><CartesianGrid stroke="#e8eded" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={40} tick={{ fontSize: 12 }} /><Tooltip content={<TooltipContent />} /><Legend /><Bar dataKey="護理" fill={COLORS[0]} radius={[0, 3, 3, 0]} /><Bar dataKey="藥劑" fill={COLORS[1]} radius={[0, 3, 3, 0]} /><Bar dataKey="醫事" fill={COLORS[2]} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></Chart>
              </Section>
            </div>
            <div className="two-column">
              <Section title="療程來源" detail="D1 與 D2-D7 已合併為同一門診療程"><Chart empty={!bySource.length}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={bySource} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius="52%" outerRadius="78%" paddingAngle={3}>{bySource.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" /></PieChart></ResponsiveContainer></Chart></Section>
              <Section title="常用注射抗生素" detail="依實際施打次數排序"><Chart empty={!topDrugs.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={topDrugs} layout="vertical" margin={{ top: 0, right: 15, left: 8, bottom: 0 }}><CartesianGrid stroke="#e8eded" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} /><Tooltip content={<TooltipContent />} /><Bar dataKey="value" name="執行次數" fill={COLORS[0]} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></Chart></Section>
            </div>
            <Section title="院區療程狀況" detail="依預計施行日期與實際施打明細；失敗與轉診另外列示"><div className="table-scroll"><table><thead><tr><th>院區</th><th className="numeric">療程</th><th className="numeric">有執行</th><th className="numeric">未執行</th><th className="numeric">待施行</th><th className="numeric">失敗標記</th><th className="numeric">轉急診/住院</th></tr></thead><tbody>{branchStatus.map(row => <tr key={row.name}><td className="emph">{row.name}</td><td className="numeric">{row.courses}</td><td className="numeric">{row.executed}</td><td className="numeric">{row.missed}</td><td className="numeric">{row.pending}</td><td className="numeric">{row.failed}</td><td className="numeric">{row.transferred}</td></tr>)}</tbody></table></div></Section>
            <div className="insight-row"><div><strong>{number(cases.filter(course => course.failed).length)}</strong><span>標記失敗個案</span></div><div><strong>{number(cases.filter(course => course.transferred).length)}</strong><span>轉急診 / 住院</span></div><div><strong>{number(cases.filter(course => course.accounts.length > 1).length)}</strong><span>合併的 D1 / D2 療程</span></div><div><strong>{number(selectedIssues.length)}</strong><span>待檢核項目</span></div><button onClick={() => switchView('audit')}>查看資料檢核 →</button></div>
          </>}

          {view === 'execution' && <>
            <div className="stats-grid three">
              {statLine('施打總次數', number(events.length), '#087c72', Activity)}
              {statLine('有施打的療程', number(new Set(events.map(event => event.courseId)).size), '#e57443', Users)}
              {statLine('注射藥品種類', number(new Set(events.map(event => event.drugCode)).size), '#8b65a3', Pill)}
            </div>
            <div className="two-column wide-left">
              <Section title={month === 'all' ? '每月施打次數' : '每日施打次數'}><Chart empty={!events.length}><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 14, left: -24, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" minTickGap={24} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip content={<TooltipContent />} /><Legend />{CAMPUSES.filter(name => campus === '全部院區' || campus === name).map((name, i) => <Area key={name} dataKey={name} stackId="a" stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.8} />)}</AreaChart></ResponsiveContainer></Chart></Section>
              <Section title="施打時段" detail="實際時間，以整點分組"><Chart empty={!events.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={hourly} margin={{ top: 10, right: 8, left: -24, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" interval={3} tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip content={<TooltipContent />} /><Bar dataKey="次數" fill={COLORS[1]} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></Chart></Section>
            </div>
            <div className="two-column"><Section title="藥品施打排行"><Chart empty={!topDrugs.length}><ResponsiveContainer width="100%" height="100%"><BarChart data={topDrugs} layout="vertical" margin={{ top: 0, right: 15, left: 8, bottom: 0 }}><CartesianGrid stroke="#e8eded" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} /><Tooltip content={<TooltipContent />} /><Bar dataKey="value" name="次數" fill={COLORS[0]} /></BarChart></ResponsiveContainer></Chart></Section><Section title="醫令頻率"><Chart empty={!byFrequency.length}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byFrequency} dataKey="value" nameKey="name" cx="50%" cy="46%" outerRadius="76%">{byFrequency.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" /></PieChart></ResponsiveContainer></Chart></Section></div>
            <Section title="科別與醫師" detail="依施打次數排序"><div className="table-scroll"><table><thead><tr><th>科別</th><th>醫師</th><th className="numeric">療程數</th><th className="numeric">施打次數</th></tr></thead><tbody>{staffStats.map((item, index) => <tr key={index}><td>{item.department}</td><td>{item.doctor}</td><td className="numeric">{number(item.cases.size)}</td><td className="numeric emph">{number(item.executions)}</td></tr>)}</tbody></table></div></Section>
            <Section title="施打紀錄" detail={`共 ${number(filteredEvents.length)} 次`} action={<div className="search"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="帳號、病歷號、藥品、醫師" /></div>}><div className="table-scroll"><table><thead><tr><th>執行時間</th><th>績效月</th><th>院區</th><th>帳號</th><th>病歷號</th><th>注射抗生素</th><th>頻率</th><th>來源列</th></tr></thead><tbody>{filteredEvents.slice((page - 1) * pageSize, page * pageSize).map(event => <tr key={event.id}><td className="nowrap">{formatDate(event.time, true)}</td><td>{event.month}</td><td>{event.campus}</td><td className="mono">{event.account}</td><td className="mono">{event.chartNo}</td><td>{event.drugName}</td><td>{event.frequency}</td><td className="mono">{event.rowId}</td></tr>)}</tbody></table></div><Pagination page={page} total={filteredEvents.length} size={pageSize} onChange={setPage} /></Section>
          </>}

          {view === 'performance' && <>
            <div className="stats-grid three">
              {statLine('護理點數', number(total.nursing * POINTS.nursing, 2), '#087c72', Activity)}
              {statLine('藥劑點數', number(total.pharmacy * POINTS.pharmacy, 2), '#e57443', Pill)}
              {statLine('醫事點數', number(total.medicalAffairs * POINTS.medicalAffairs, 3), '#8b65a3', ClipboardList)}
            </div>
            <Section title="各職類績效" detail="依執行時間 08:00 切月；管理費每帳號只採一筆非 D1 申報"><div className="table-scroll"><table className="performance-table"><thead><tr><th>院區</th><th className="numeric">護理次數</th><th className="numeric">護理點數</th><th className="numeric">藥劑筆數</th><th className="numeric">藥劑點數</th><th className="numeric">管理費申報</th><th className="numeric">醫事點數</th><th className="numeric">總點數</th></tr></thead><tbody>{visibleReport.map(row => <tr key={row.campus}><td className="emph">{row.campus}</td><td className="numeric">{number(row.nursing)}</td><td className="numeric">{number(row.nursingPoints, 2)}</td><td className="numeric">{number(row.pharmacy)}</td><td className="numeric">{number(row.pharmacyPoints, 2)}</td><td className="numeric">{number(row.medicalAffairs)}</td><td className="numeric">{number(row.medicalAffairsPoints, 3)}</td><td className="numeric emph">{number(row.totalPoints, 3)}</td></tr>)}</tbody><tfoot><tr><td>合計</td><td className="numeric">{number(total.nursing)}</td><td className="numeric">{number(total.nursing * POINTS.nursing, 2)}</td><td className="numeric">{number(total.pharmacy)}</td><td className="numeric">{number(total.pharmacy * POINTS.pharmacy, 2)}</td><td className="numeric">{number(total.medicalAffairs)}</td><td className="numeric">{number(total.medicalAffairs * POINTS.medicalAffairs, 3)}</td><td className="numeric">{number(total.totalPoints, 3)}</td></tr></tfoot></table></div></Section>
            <div className="two-column wide-left"><Section title="每月點數趨勢"><Chart empty={!monthlyPoints.length}><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyPoints} margin={{ top: 12, right: 14, left: -15, bottom: 0 }}><CartesianGrid stroke="#e8eded" vertical={false} /><XAxis dataKey="name" minTickGap={16} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Area dataKey="護理" stackId="a" stroke={COLORS[0]} fill={COLORS[0]} /><Area dataKey="藥劑" stackId="a" stroke={COLORS[1]} fill={COLORS[1]} /><Area dataKey="醫事" stackId="a" stroke={COLORS[2]} fill={COLORS[2]} /></AreaChart></ResponsiveContainer></Chart></Section><Section title="計算依據"><div className="rules"><div><Activity size={19} /><strong>護理</strong><span>注射抗生素逐次執行 × 0.1 點</span></div><div><Pill size={19} /><strong>藥劑</strong><span>有執行的藥品原始列 × 0.05 點</span></div><div><ClipboardList size={19} /><strong>醫事</strong><span>非 D1 帳號管理費申報 × 0.025 點</span></div><p>相同療程、藥品、時間只計一次施打；跨月原始列在各有執行的月份各計一筆保管。</p></div></Section></div>
          </>}

          {view === 'cases' && <>
            <div className="stats-grid">{statLine('範圍內療程', number(cases.length), '#087c72', Users)}{statLine('有施打紀錄', number(cases.filter(course => course.executionCount > 0).length), '#e57443', Stethoscope)}{statLine('未執行', number(cases.filter(course => courseStatus(course) === '未執行').length), '#8b65a3', AlertTriangle)}{statLine('待施行', number(cases.filter(course => courseStatus(course) === '待施行').length), '#d6a637', ClipboardList)}</div>
            <Section title="療程清單" detail="門診 D1 與 D2-D7 依同院區病歷號及相近開案日期合併" action={<div className="search"><Search size={16} /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="帳號、病歷號、醫師、診斷" /></div>}><div className="table-scroll"><table><thead><tr><th>開案日期</th><th>院區</th><th>病歷號</th><th>帳號</th><th>來源</th><th>主診斷</th><th className="numeric">施打</th><th className="numeric">申報</th><th>狀態</th></tr></thead><tbody>{filteredCases.slice((page - 1) * pageSize, page * pageSize).map(course => <tr key={course.id} className="clickable" onClick={() => setSelectedCourseId(course.id)}><td>{formatDate(course.openingDate)}</td><td>{course.campus}</td><td className="mono">{course.chartNo}</td><td className="mono accounts-cell">{course.accounts.join(' / ')}</td><td>{course.source}</td><td>{course.diagnosis || '—'}</td><td className="numeric">{number(course.executionCount)}</td><td className="numeric">{number(course.feeCount)}</td><td><span className={`status ${courseStatus(course) === '失敗標記' || courseStatus(course) === '未執行' ? 'danger' : courseStatus(course) === '有執行' ? 'good' : 'neutral'}`}>{courseStatus(course)}</span></td></tr>)}</tbody></table></div><Pagination page={page} total={filteredCases.length} size={pageSize} onChange={setPage} /></Section>
          </>}

          {view === 'audit' && <>
            <div className="stats-grid three">{statLine('待檢核項目', number(selectedIssues.length), '#e57443', AlertTriangle)}{statLine('重複施打紀錄', number(selectedIssues.filter(issue => issue.code === 'duplicate').length), '#8b65a3', Filter)}{statLine('退量與執行並存', number(selectedIssues.filter(issue => issue.code === 'refund-execution').length), '#087c72', Check)}</div>
            <Section title="藥品分類" detail="預設只納入已確認的注射抗生素；新藥品可在此勾選納入護理與藥劑計算"><div className="drug-list">{data.drugCatalog.map(drug => <label className="drug-item" key={drug.code || drug.name}><input type="checkbox" checked={includedCodes.has(drug.code)} onChange={() => toggleDrug(drug.code)} /><span className="drug-check"><Check size={13} /></span><span className="drug-main"><strong>{drug.name}</strong><small>{drug.code || '無藥品碼'} · {number(drug.rows)} 列</small></span><span className={`kind kind-${drug.kind}`}>{drug.kind === 'injectable-antibiotic' ? '注射抗生素' : drug.kind === 'diluent' ? '稀釋液' : drug.kind === 'review' ? '待確認' : '其他藥品'}</span></label>)}</div></Section>
            <Section title="異常與核對" detail={`共 ${number(selectedIssues.length)} 項；來源列可與原始 Excel 比對`} action={<label className="issue-select"><select value={issueFilter} onChange={event => { setIssueFilter(event.target.value); setPage(1); }}><option value="all">全部類型</option>{issueCodes.map(code => <option key={code}>{code}</option>)}</select><ChevronDown size={15} /></label>}><div className="table-scroll"><table><thead><tr><th>類型</th><th>院區</th><th>帳號</th><th>說明</th><th>來源列</th></tr></thead><tbody>{selectedIssues.slice((page - 1) * pageSize, page * pageSize).map((issue: DataIssue, index) => <tr key={`${issue.rowId}-${issue.code}-${index}`}><td><span className={`status ${issue.level === 'warning' ? 'neutral' : 'danger'}`}>{issue.code}</span></td><td>{issue.campus}</td><td className="mono">{issue.account}</td><td>{issue.message}</td><td className="mono">{data.records.find(row => row.id === issue.rowId)?.file}　#{data.records.find(row => row.id === issue.rowId)?.rowNumber}</td></tr>)}</tbody></table></div><Pagination page={page} total={selectedIssues.length} size={pageSize} onChange={setPage} /></Section>
          </>}
        </>}
      </div>
    </main>

    {selectedCase && <div className="drawer-backdrop" onClick={() => setSelectedCourseId(null)}><aside className="drawer" onClick={event => event.stopPropagation()}><div className="drawer-head"><div><small>療程明細</small><h2>{selectedCase.chartNo}</h2></div><button aria-label="關閉明細" onClick={() => setSelectedCourseId(null)}><X size={20} /></button></div><div className="drawer-body"><dl><div><dt>院區</dt><dd>{selectedCase.campus}</dd></div><div><dt>來源</dt><dd>{selectedCase.source}</dd></div><div><dt>開案日期</dt><dd>{formatDate(selectedCase.openingDate)}</dd></div><div><dt>醫師</dt><dd>{selectedCase.doctor || '—'}</dd></div><div><dt>帳號</dt><dd className="mono">{selectedCase.accounts.join(' / ')}</dd></div><div><dt>主診斷</dt><dd>{selectedCase.diagnosis || '—'}</dd></div><div><dt>施打次數</dt><dd>{selectedCase.executionCount}</dd></div><div><dt>管理費申報</dt><dd>{selectedCase.feeCount}</dd></div><div><dt>轉急診日</dt><dd>{formatDate(selectedCase.transferEmergency)}</dd></div><div><dt>轉住院日</dt><dd>{formatDate(selectedCase.transferHospital)}</dd></div></dl><h3>施打時間</h3><div className="drawer-list">{caseEvents.length ? caseEvents.map(event => <div key={event.id}><time>{formatDate(event.time, true)}</time><span>{event.drugName}</span></div>) : <p>無注射抗生素施打紀錄</p>}</div><h3>原始資料列</h3><div className="drawer-list">{caseRows.map(row => <div key={row.id}><time>{row.file} #{row.rowNumber}</time><span>{row.treatment} · {row.drugName}</span></div>)}</div></div></aside></div>}
  </div>;
}

function Pagination({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return <div className="pagination"><span>{number(total)} 筆 · 第 {page} / {pages} 頁</span><div><button disabled={page <= 1} onClick={() => onChange(page - 1)}>上一頁</button><button disabled={page >= pages} onClick={() => onChange(page + 1)}>下一頁</button></div></div>;
}
