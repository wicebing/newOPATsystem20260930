import { describe, expect, it } from 'vitest';
import { analyze } from './opat';
import type { RawRow } from './opat';
import { buildCompletion, dailyComparison, summarizeCompletion } from './completion';

function row(values: Partial<RawRow> = {}): RawRow {
  return {
    帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東',
    診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
    藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 1,
    執行次數明細: '2026/07/23 09:00', 執行人員明細: 'G00001王甲乙',
    開始日: '20260723', 結束日: '20260724', 確認日期: '20260723',
    '39029C管理費數量': 0, ...values,
  };
}

const included = new Set(['SIN1AB20']);
const today = new Date(2026, 6, 25);

describe('scheduled injection completion', () => {
  it('counts due planned doses and distinguishes partial from completed courses', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [row()] }]);
    const report = buildCompletion(data, included, today);
    expect(report.courses[0].status).toBe('未完成');
    expect(summarizeCompletion(report, '2026-07', '竹東')).toMatchObject({
      expected: 2, executed: 1, missed: 1, doseRate: 0.5,
      dueCourses: 1, completedCourses: 0, courseRate: 0,
    });
  });

  it('uses frequency and does not double-count overlapping orders', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      row({ 頻率: 'Q12H', 開始日: '20260723', 結束日: '20260723', 執行次數: 2,
        執行次數明細: '2026/07/23 09:00, 2026/07/23 21:00',
        執行人員明細: 'G00001王甲乙, G00002李丙丁' }),
      row({ 頻率: 'Q12H', 開始日: '20260723', 結束日: '20260723', 執行次數: 0,
        執行次數明細: '', 執行人員明細: '' }),
    ] }]);
    const report = buildCompletion(data, included, today);
    expect(report.days).toHaveLength(1);
    expect(summarizeCompletion(report)).toMatchObject({ expected: 2, executed: 2, doseRate: 1, completedCourses: 1 });
  });

  it('excludes today and future dates from the overdue denominator', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [row({ 結束日: '20260726' })] }]);
    const report = buildCompletion(data, included, new Date(2026, 6, 24));
    expect(summarizeCompletion(report)).toMatchObject({ expected: 1, executed: 1, dueCourses: 0 });
    expect(report.courses[0].status).toBe('進行中');
  });

  it('keeps unsupported schedules out of the completion rate', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [row({ 頻率: 'Q48H' })] }]);
    const report = buildCompletion(data, included, today);
    expect(report.courses[0].status).toBe('資料不足');
    expect(summarizeCompletion(report)).toMatchObject({ expected: 0, doseRate: null, unknownCourses: 1 });
  });

  it('treats the snapshot day and later as pending, while keeping earlier missed doses visible', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料g.xlsx', rows: [
      row({ 執行次數: 0, 執行次數明細: '', 執行人員明細: '', 開始日: '20260907', 結束日: '20260909', 確認日期: '20260907' }),
      row({ 帳號: '26T70000002', 病歷號: 'G000002', 執行次數: 0, 執行次數明細: '', 執行人員明細: '',
        開始日: '20260908', 結束日: '20260910', 確認日期: '20260908' }),
    ] }]);
    const report = buildCompletion(data, included, data.snapshotDate);
    expect(report.asOf).toBe('2026-09-07');
    expect(report.days).toHaveLength(1);
    expect(report.courses.map(course => course.status)).toEqual(['進行中', '待執行']);
    expect(summarizeCompletion(report)).toMatchObject({ expected: 1, missed: 1, dueCourses: 0 });
  });

  it('shows planned and actual in one daily bar, including extra injections', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料g.xlsx', rows: [
      row({ 開始日: '20260906', 結束日: '20260906', 確認日期: '20260906',
        執行次數明細: '2026/09/06 09:00' }),
      row({ 帳號: '26T70000002', 病歷號: 'G000002', 開始日: '20260907', 結束日: '20260907',
        確認日期: '20260907', 執行次數: 0, 執行次數明細: '' }),
      row({ 帳號: '26T70000003', 病歷號: 'G000003', 開始日: '20260908', 結束日: '20260908',
        確認日期: '20260908', 執行次數明細: '2026/09/07 10:00' }),
    ] }]);
    const report = buildCompletion(data, included, data.snapshotDate);
    expect(dailyComparison(data, report, included, '2026-09', '竹東')).toEqual([
      expect.objectContaining({ key: '2026-09-06', 預定: 1, 實際: 1, 完成: 1, 未完成: 0, 額外施打: 0 }),
      expect.objectContaining({ key: '2026-09-07', 預定: 1, 實際: 1, 完成: 0, 未完成: 1, 額外施打: 1 }),
    ]);
    expect(dailyComparison(data, report, included, 'all', '竹東')[0]).toMatchObject({
      key: '2026-09', 預定: 2, 實際: 2, 完成: 1, 未完成: 1, 額外施打: 1,
    });
  });
});
