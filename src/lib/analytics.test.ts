import { describe, expect, it } from 'vitest';
import { analyze } from './opat';
import { executionTrend, hourlyByCampus, nonQdOrders, prescribingMatrix, selectedAntibioticOrders, weeklyOrders } from './analytics';
import type { RawRow } from './opat';

const base: RawRow = {
  帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東', 看診醫師: '測試醫師甲', 科別: '內科部',
  診療行為: '門診轉OPAT「D1」', 藥品八碼: 'SIN1AB20', 組合商品名: 'Sintrix 500 mg/vial',
  確認日期: '20260801', 開始日: '20260801', 結束日: '20260801', 頻率: 'QD',
  執行次數: 1, 執行次數明細: '2026/08/01 09:00', '39029C管理費數量': 0,
};
const row = (values: RawRow): RawRow => ({ ...base, ...values });

describe('execution and prescribing analytics', () => {
  it('assigns daily injections to 08:00-to-08:00 days, including both month boundaries', () => {
    const data = analyze([{ name: '1151002_OPAT個案資料g.xlsx', rows: [
      row({ 帳號: '26T70000011', 病歷號: 'G000011', 院區: '竹北', 執行次數明細: '2026/09/01 07:59',
        開始日: '20260901', 結束日: '20260901' }),
      row({ 帳號: '26T70000012', 病歷號: 'G000012', 院區: '竹東', 執行次數明細: '2026/09/01 08:00',
        開始日: '20260901', 結束日: '20260901' }),
      row({ 帳號: '26T40000013', 病歷號: 'H000013', 院區: '新竹', 執行次數明細: '2026/10/01 07:59',
        開始日: '20261001', 結束日: '20261001' }),
      row({ 帳號: '26T70000014', 病歷號: 'G000014', 院區: '竹東', 執行次數明細: '2026/10/01 08:00',
        開始日: '20261001', 結束日: '20261001' }),
    ] }]);
    const september = executionTrend(data.executions, '2026-09');
    expect(september).toHaveLength(30);
    expect(september[0]).toMatchObject({ key: '2026-09-01', name: '9/1', 竹東: 1, 竹北: 0 });
    expect(september.at(-1)).toMatchObject({ key: '2026-09-30', name: '9/30', 新竹: 1 });
    expect(september.some(day => day.key === '2026-10-01')).toBe(false);
    expect(executionTrend(data.executions, '2026-08').at(-1)).toMatchObject({ key: '2026-08-31', 竹北: 1 });
    expect(executionTrend(data.executions, '2026-10')[0]).toMatchObject({ key: '2026-10-01', 竹東: 1, 新竹: 0 });
    expect(executionTrend(data.executions).map(row => [row.key, row.新竹 + row.竹北 + row.竹東]))
      .toEqual([['2026-08', 1], ['2026-09', 2], ['2026-10', 1]]);
  });

  it('groups opened courses and prescribed injections by Monday weeks and campus', () => {
    const data = analyze([{ name: '1150804_OPAT個案資料g.xlsx', rows: [
      row({ 開始日: '20260801', 結束日: '20260802', 確認日期: '20260801' }),
      row({ 帳號: '26T70000002', 病歷號: 'G000001', 診療行為: '門診轉OPAT「D2-D7」',
        開始日: '20260802', 結束日: '20260803', 確認日期: '20260802' }),
      row({ 帳號: '26T70000003', 病歷號: 'G000003', 院區: '竹北', 頻率: 'Q12H',
        開始日: '20260803', 結束日: '20260804', 確認日期: '20260803' }),
      row({ 帳號: '26T70000004', 病歷號: 'G000004', 藥品八碼: 'SAL1FAD0',
        組合商品名: '100 Saline inj 0.9% 100 mL /bag', 開始日: '20260803', 結束日: '20260804' }),
    ] }]);
    const weekly = weeklyOrders(data, new Set(['SIN1AB20', 'SAL1FAD0']), '2026-08');
    expect(weekly.courses).toEqual([
      expect.objectContaining({ key: '2026-07-27', 竹東: 1, 竹北: 0, total: 1 }),
      expect.objectContaining({ key: '2026-08-03', 竹東: 0, 竹北: 1, total: 1 }),
    ]);
    expect(weekly.doses).toEqual([
      expect.objectContaining({ key: '2026-07-27', 竹東: 2, 竹北: 0, total: 2 }),
      expect.objectContaining({ key: '2026-08-03', 竹東: 1, 竹北: 4, total: 5 }),
    ]);
  });

  it('separates hourly counts by campus while retaining a comparable total', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料g.xlsx', rows: [
      row({}),
      row({ 帳號: '26T70000002', 病歷號: 'G000002', 院區: '竹北', 執行次數明細: '2026/08/01 09:30' }),
      row({ 帳號: '26T40000003', 病歷號: 'H000003', 院區: '新竹', 執行次數明細: '2026/08/01 10:00' }),
    ] }]);
    const hours = hourlyByCampus(data.executions);
    expect(hours).toHaveLength(24);
    expect(hours[9]).toMatchObject({ 新竹: 0, 竹北: 1, 竹東: 1, total: 2 });
    expect(hours[10]).toMatchObject({ 新竹: 1, 竹北: 0, 竹東: 0, total: 1 });
  });

  it('uses distinct OPAT courses, not injection frequency, as each physician denominator', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料g.xlsx', rows: [
      row({ 執行次數: 2, 執行次數明細: '2026/08/01 09:00, 2026/08/02 09:00' }),
      row({ 帳號: '26T70000002', 病歷號: 'G000001', 診療行為: '門診轉OPAT「D2-D7」',
        確認日期: '20260802', 藥品八碼: 'CEI1AB20', 組合商品名: 'Cefin 500 mg/vial' }),
      row({ 帳號: '26T70000003', 病歷號: 'G000003', 確認日期: '20260803',
        藥品八碼: 'CEI1AB20', 組合商品名: 'Cefin 500 mg/vial' }),
      row({ 帳號: '26T70000004', 病歷號: 'G000004', 院區: '竹北', 看診醫師: '測試醫師乙',
        藥品八碼: 'SIN1AB20' }),
    ] }]);
    const matrix = prescribingMatrix(data, new Set(['SIN1AB20', 'CEI1AB20']), '2026-08', '全部院區');
    const doctor = matrix.doctors.find(item => item.doctor === '測試醫師甲')!;
    expect(doctor.courses).toBe(2);
    expect(doctor.byDrug.SIN1AB20).toEqual({ courses: 1, rate: 0.5 });
    expect(doctor.byDrug.CEI1AB20).toEqual({ courses: 2, rate: 1 });
    expect(matrix.drugs[0]).toMatchObject({ code: 'CEI1AB20', courses: 2 });
    expect(prescribingMatrix(data, new Set(['SIN1AB20', 'CEI1AB20']), '2026-08', '竹北').doctors)
      .toMatchObject([{ doctor: '測試醫師乙', courses: 1 }]);
  });

  it('keeps saline-only and oral-only courses out of prescribing volume even if selected by code', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料g.xlsx', rows: [
      row({}),
      row({ 帳號: '26T70000002', 病歷號: 'G000002', 藥品八碼: 'SAL1FAD0', 組合商品名: '100 Saline inj 0.9% 100 mL /bag' }),
      row({ 帳號: '26T70000003', 病歷號: 'G000003', 藥品八碼: 'CRA4AK37', 組合商品名: 'Cravit 500 mg/tab' }),
    ] }]);
    const matrix = prescribingMatrix(data, new Set(['SIN1AB20', 'SAL1FAD0', 'CRA4AK37']), '2026-08', '全部院區');
    expect(matrix.drugs.map(drug => drug.code)).toEqual(['SIN1AB20']);
    expect(matrix.doctors).toMatchObject([{ doctor: '測試醫師甲', courses: 1 }]);
    expect(matrix.doctors[0].byDrug.SIN1AB20).toEqual({ courses: 1, rate: 1 });
  });

  it('lists non-QD antibiotic orders with prescriber and drug once per order, not per execution', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料g.xlsx', rows: [
      row({ 帳號: '26T70000011', 病歷號: 'G000011', 看診醫師: '測試醫師乙', 頻率: 'Q12H',
        開始日: '20260831', 結束日: '20260902', 執行次數: 2,
        執行次數明細: '2026/09/01 09:00, 2026/09/01 21:00' }),
      row({ 帳號: '26T70000011', 病歷號: 'G000011', 看診醫師: '測試醫師乙', 頻率: 'Q12H',
        開始日: '20260831', 結束日: '20260902', 執行次數: 2,
        執行次數明細: '2026/09/01 09:00, 2026/09/01 21:00' }),
      row({ 帳號: '26T70000012', 病歷號: 'G000012', 頻率: 'QD', 開始日: '20260901', 結束日: '20260901' }),
      row({ 帳號: '26T70000013', 病歷號: 'G000013', 頻率: 'BID', 開始日: '20260801', 結束日: '20260801' }),
      row({ 帳號: '26T70000014', 病歷號: 'G000014', 頻率: 'Q12H', 開始日: '20260901', 結束日: '20260901',
        藥品八碼: 'SAL1FAD0', 組合商品名: '100 Saline inj 0.9% 100 mL /bag' }),
    ] }]);
    const selected = new Set(['SIN1AB20', 'SAL1FAD0']);
    const allOrders = selectedAntibioticOrders(data, selected, '2026-09', '竹東');
    const nonQd = nonQdOrders(data, selected, '2026-09', '竹東');
    expect(allOrders).toHaveLength(2);
    expect(nonQd).toHaveLength(1);
    expect(nonQd[0]).toMatchObject({ doctor: '測試醫師乙', drugName: 'Sintrix 500 mg/vial', frequency: 'Q12H', account: '26T70000011' });
    expect(nonQdOrders(data, selected, '2026-08', '竹東').map(item => item.account)).toEqual(['26T70000011', '26T70000013']);
    expect(nonQdOrders(data, selected, '2026-09', '新竹')).toHaveLength(0);
  });
});
