import { describe, expect, it } from 'vitest';
import { analyze } from './opat';
import { nhiPoints } from './nhi';
import type { RawRow } from './opat';

const base: RawRow = {
  帳號: 'A', 病歷號: 'G001', 院區: '竹東', 診療行為: '門診轉OPAT「D2-D7」',
  藥品八碼: 'SIN1AB20', 組合商品名: 'Sintrix 500 mg/vial', 帳號看診日: '2026/08/31',
  確認日期: '20260901', 開始日: '20260901', 結束日: '20260901', 頻率: 'QD',
  執行次數: 1, 執行次數明細: '2026/09/01 09:00',
  '39027C注射一次數量': 3, '39028C注射二次數量': 0, '39029C管理費數量': 1,
};

describe('NHI claim point estimate', () => {
  it('counts account-level code quantities once and uses the latest source snapshot', () => {
    const corrected = { ...base, '39027C注射一次數量': 2 };
    const data = analyze([
      { name: '1150908_OPAT個案資料G.xlsx', rows: [base,
        { ...base, 藥品八碼: 'SAL1FAD0', 組合商品名: '100 Saline inj 0.9% 100 mL /bag' }] },
      { name: '1150910_OPAT個案資料G.xlsx', rows: [corrected,
        { ...corrected, 帳號: 'B', 病歷號: 'G002', 帳號看診日: '2026/09/01',
          '39027C注射一次數量': 0, '39028C注射二次數量': 2, '39029C管理費數量': 0 },
        { ...corrected, 帳號: 'C', 病歷號: 'G003', 帳號看診日: '2026/09/01',
          診療行為: '門診轉OPAT「D1」', '39027C注射一次數量': 1, '39029C管理費數量': 1 }] },
    ]);
    const august = nhiPoints(data, '2026-08').find(row => row.campus === '竹東')!;
    expect(august).toMatchObject({ injectionOnce: 2, injectionMultiple: 0, management: 1,
      injectionOncePoints: 2062, managementPoints: 500, totalPoints: 2562 });
    expect(nhiPoints(data, '2026-09').find(row => row.campus === '竹東'))
      .toMatchObject({ injectionOnce: 1, injectionMultiple: 2, management: 0, totalPoints: 3499 });
    expect(nhiPoints(data, 'all').find(row => row.campus === '竹東'))
      .toMatchObject({ injectionOnce: 3, injectionMultiple: 2, management: 1, totalPoints: 6061 });
  });

  it('removes a claim corrected to zero in a newer snapshot', () => {
    const data = analyze([
      { name: '1150908_OPAT個案資料G.xlsx', rows: [base] },
      { name: '1150910_OPAT個案資料G.xlsx', rows: [{ ...base,
        '39027C注射一次數量': 0, '39029C管理費數量': 0 }] },
    ]);
    expect(nhiPoints(data, 'all').find(row => row.campus === '竹東'))
      .toMatchObject({ injectionOnce: 0, management: 0, totalPoints: 0 });
  });

  it('keeps claims from an undetermined campus visible in the all-campus total', () => {
    const data = analyze([{ name: '1150908_OPAT個案資料G.xlsx', rows: [{ ...base,
      帳號: 'UNKNOWN', 病歷號: 'G001', 院區: '', '39027C注射一次數量': 1, '39029C管理費數量': 0 }] }]);
    expect(nhiPoints(data, 'all').find(row => row.campus === '未判定'))
      .toMatchObject({ injectionOnce: 1, totalPoints: 1031 });
    expect(data.issues.some(issue => issue.code === 'campus')).toBe(true);
  });
});
