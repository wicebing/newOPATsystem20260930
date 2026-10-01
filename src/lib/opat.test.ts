import { describe, expect, it } from 'vitest';
import { analyze, courseStatus, performance, reportingMonth } from './opat';
import type { RawRow } from './opat';

function row(values: Partial<RawRow> = {}): RawRow {
  return {
    帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東',
    診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
    藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 1,
    執行次數明細: '2026/07/23 10:40', 針劑應退量: 0,
    '39029C管理費數量': 0, 確認日期: '20260723',
    ...values,
  };
}

describe('OPAT calculation', () => {
  it('keeps executed injections with negative refund and merges outpatient D1/D2 as one course', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      row({ 執行次數: 3, 針劑應退量: -8, 執行次數明細: '2026/07/23 10:40, 2026/07/24 11:25, 2026/07/27 11:32' }),
      row({ 帳號: '26T70000002', 診療行為: '門診轉OPAT「D2-D7」', 確認日期: '20260724', 執行次數明細: '2026/07/28 10:36', '39029C管理費數量': 1 }),
    ] }]);
    const points = performance(data, '2026-07', new Set(['SIN1AB20']));
    expect(data.courses).toHaveLength(1);
    expect(points.find(item => item.campus === '竹東')).toMatchObject({ nursing: 4, pharmacy: 2, medicalAffairs: 1 });
    expect(data.issues.some(issue => issue.code === 'refund-execution')).toBe(true);
  });

  it('fills the H export as Hsinchu and counts a repeated timestamp only once', () => {
    const data = analyze([{ name: 'sample-h.xlsx', rows: [
      row({ 帳號: '26T40000001', 病歷號: 'H000001', 院區: '', 執行次數: 2, 針劑應退量: -4, 執行次數明細: '2026/08/08 07:23, 2026/08/09 07:04' }),
      row({ 帳號: '26T40000001', 病歷號: 'H000001', 院區: '', 執行次數明細: '2026/08/09 07:04' }),
    ] }]);
    const points = performance(data, '2026-08', new Set(['SIN1AB20']));
    expect(points.find(item => item.campus === '新竹')).toMatchObject({ nursing: 2, pharmacy: 1 });
    expect(data.issues.some(issue => issue.code === 'duplicate')).toBe(true);
  });

  it('uses the 08:00 boundary per event and excludes oral medicine and saline', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      row({ 執行次數: 2, 頻率: 'Q12H', 執行次數明細: '2026/07/01 07:59, 2026/07/01 08:00' }),
      row({ 組合商品名: '100 Saline inj 0.9% 100 mL /bag', 藥品八碼: 'SAL1FAD0' }),
      row({ 組合商品名: 'Cravit 500 mg/tab', 藥品八碼: 'CRA4AK37' }),
    ] }]);
    const included = new Set(['SIN1AB20']);
    expect(reportingMonth(new Date(2026, 6, 1, 7, 59))).toBe('2026-06');
    expect(reportingMonth(new Date(2026, 6, 1, 8, 0))).toBe('2026-07');
    expect(performance(data, '2026-06', included).find(item => item.campus === '竹東')).toMatchObject({ nursing: 1, pharmacy: 1 });
    expect(performance(data, '2026-07', included).find(item => item.campus === '竹東')).toMatchObject({ nursing: 1, pharmacy: 1 });
  });

  it('caps QD at one and Q12H at two executions per calendar day', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      row({ 執行次數: 2, 執行次數明細: '2026/07/23 09:00, 2026/07/23 17:00' }),
      row({ 帳號: '26T70000002', 病歷號: 'G000002', 頻率: 'Q12H', 執行次數: 3, 執行次數明細: '2026/07/23 08:00, 2026/07/23 20:00, 2026/07/23 21:00' }),
    ] }]);
    expect(performance(data, '2026-07', new Set(['SIN1AB20'])).find(item => item.campus === '竹東')).toMatchObject({ nursing: 3, pharmacy: 2 });
    expect(data.issues.filter(issue => issue.code === 'frequency')).toHaveLength(2);
  });

  it('does not count the same D1/D2 injection twice when account numbers differ', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      row({ 執行次數: 3, 執行次數明細: '2026/07/23 10:40, 2026/07/24 11:25, 2026/07/27 11:32' }),
      row({ 帳號: '26T70000002', 診療行為: '門診轉OPAT「D2-D7」', 確認日期: '20260724', 執行次數明細: '2026/07/24 11:25', '39029C管理費數量': 1 }),
    ] }]);
    expect(data.courses).toHaveLength(1);
    expect(performance(data, '2026-07', new Set(['SIN1AB20'])).find(item => item.campus === '竹東')).toMatchObject({ nursing: 3, pharmacy: 1, medicalAffairs: 1 });
    expect(data.issues.some(issue => issue.code === 'duplicate')).toBe(true);
  });

  it('distinguishes future scheduled courses from overdue courses without injection records', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      row({ 執行次數: 0, 執行次數明細: '', 開始日: '20260802', 結束日: '20260803' }),
    ] }]);
    expect(courseStatus(data.courses[0], new Date(2026, 7, 1))).toBe('待施行');
    expect(courseStatus(data.courses[0], new Date(2026, 7, 4))).toBe('未執行');
  });
});
