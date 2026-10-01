import { describe, expect, it } from 'vitest';
import { analyze } from './opat';
import { groupExecutors } from './staff';

describe('executor analytics', () => {
  it('counts administrations separately from patients and courses', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [{
      帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東',
      診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
      藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 2,
      執行次數明細: '2026/07/23 09:00, 2026/07/24 09:00',
      執行人員明細: 'G00001王甲乙, G00001王甲乙',
      開始日: '20260723', 結束日: '20260724',
      '39029C管理費數量': 0,
    }] }]);
    expect(groupExecutors(data.executions)[0]).toMatchObject({
      id: 'G00001', name: '王甲乙', campus: '竹東', executions: 2,
      patients: 1, courses: 1, drugs: 1,
    });
  });

  it('combines the same personnel ID across campuses', () => {
    const data = analyze([{ name: 'sample-g.xlsx', rows: [
      { 帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東', 藥品八碼: 'SIN1AB20',
        組合商品名: 'Sintrix 500 mg/vial', 頻率: 'QD', 執行次數: 1,
        執行次數明細: '2026/07/23 09:00', 執行人員明細: 'G00001王甲乙' },
      { 帳號: '26T70000002', 病歷號: 'G000002', 院區: '新竹', 藥品八碼: 'SIN1AB20',
        組合商品名: 'Sintrix 500 mg/vial', 頻率: 'QD', 執行次數: 1,
        執行次數明細: '2026/07/24 09:00', 執行人員明細: 'G00001王甲乙' },
    ] }]);
    expect(groupExecutors(data.executions)).toMatchObject([{ id: 'G00001', executions: 2, patients: 2, campus: '竹東 / 新竹' }]);
  });
});
