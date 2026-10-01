import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyze, performance } from './opat';
import { buildCompletion } from './completion';
import { createReportWorkbook } from './excel';

describe('Excel report', () => {
  it('includes legacy forms, executor-level injections, and completion evidence', () => {
    const analysis = analyze([{ name: 'sample-g.xlsx', rows: [{
      帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東',
      診療行為: '門診轉OPAT「D2-D7」', 組合商品名: 'Sintrix 500 mg/vial',
      藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 1,
      執行次數明細: '2026/07/23 09:00', 執行人員明細: 'G00001王甲乙',
      開始日: '20260723', 結束日: '20260724', 確認日期: '20260723',
      '39029C管理費數量': 1,
    }] }]);
    const included = new Set(['SIN1AB20']);
    const report = performance(analysis, '2026-07', included);
    const completion = buildCompletion(analysis, included, new Date(2026, 6, 25));
    const workbook = createReportWorkbook(analysis, report, '2026-07', '竹東', included, completion);

    expect(workbook.SheetNames).toEqual(['績效總表', '完成率', 'Step2原系統格式', '執行人員統計',
      '施打明細', '療程明細', '排程對照', 'Step1清理資料', '資料檢核']);
    const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['施打明細']);
    expect(detail[0]).toMatchObject({ 院區: '竹東', 病歷號: 'G000001', 執行人員代碼: 'G00001', 執行人員: '王甲乙' });
    const legacy = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Step1清理資料']);
    expect(legacy[0]).toMatchObject({ 帳號: '26T70000001', 執行人員明細: 'G00001王甲乙' });
    const legacyPerformance = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Step2原系統格式']);
    expect(legacyPerformance[0]).toEqual({ campus: '竹東', nursing: 1, pharmacy: 1, medicalAffairs: 1 });
    const completionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['完成率']);
    expect(completionRows[0]).toMatchObject({ 預定施打: 2, 已完成施打: 1, '施打完成率(%)': 50 });
  });
});
