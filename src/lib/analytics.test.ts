import { describe, expect, it } from 'vitest';
import { analyze } from './opat';
import { hourlyByCampus, prescribingMatrix } from './analytics';
import type { RawRow } from './opat';

const base: RawRow = {
  帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東', 看診醫師: '測試醫師甲', 科別: '內科部',
  診療行為: '門診轉OPAT「D1」', 藥品八碼: 'SIN1AB20', 組合商品名: 'Sintrix 500 mg/vial',
  確認日期: '20260801', 開始日: '20260801', 結束日: '20260801', 頻率: 'QD',
  執行次數: 1, 執行次數明細: '2026/08/01 09:00', '39029C管理費數量': 0,
};
const row = (values: RawRow): RawRow => ({ ...base, ...values });

describe('execution and prescribing analytics', () => {
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
});
