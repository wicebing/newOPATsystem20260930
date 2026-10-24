import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { analyze, performance } from './opat';
import { buildCompletion } from './completion';
import { createReportWorkbook } from './excel';

describe('Excel report', () => {
  it('includes legacy forms, executor-level injections, and completion evidence', () => {
    const analysis = analyze([{ name: '1150725_OPAT個案資料g.xlsx', rows: [{
      帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東', 看診醫師: '測試醫師',
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

    expect(workbook.SheetNames).toEqual(['績效總表', '完成率', 'Step2原系統格式', '執行人員統計', '施打時段', '醫師開立偏好',
      '施打明細', '療程明細', '排程對照', 'Step1清理資料', '重複醫令核對', '資料檢核']);
    const detail = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['施打明細']);
    expect(detail[0]).toMatchObject({ 院區: '竹東', 病歷號: 'G000001', 執行人員代碼: 'G00001', 執行人員: '王甲乙', 施打歸屬日: '2026-07-23' });
    const legacy = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Step1清理資料']);
    expect(legacy[0]).toMatchObject({ 帳號: '26T70000001', 執行人員明細: 'G00001王甲乙' });
    const legacyPerformance = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Step2原系統格式']);
    expect(legacyPerformance[0]).toEqual({ campus: '竹東', nursing: 1, pharmacy: 1, medicalAffairs: 1 });
    const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['績效總表']);
    expect(summary[0]).toMatchObject({ 資料快照日: '2026-07-25', 原始施打明細: 1, 排除重複或超頻: 0 });
    const hourly = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['施打時段']);
    expect(hourly[9]).toMatchObject({ 時段: '09:00', 竹東: 1, 合計: 1 });
    const prescribing = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['醫師開立偏好']);
    expect(prescribing[0]).toMatchObject({ 醫師: '測試醫師', 醫師OPAT療程數: 1, 此藥療程數: 1, '開立比例(%)': 100 });
    const completionRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['完成率']);
    expect(completionRows[0]).toMatchObject({ 資料快照日: '2026-07-25', 預定施打: 2, 已完成施打: 1, '施打完成率(%)': 50 });
  });

  it('exports one cleaned order and a traceable duplicate comparison', () => {
    const original = {
      帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東', 看診醫師: '測試醫師',
      診療行為: '門診轉OPAT「D2-D7」', 健保碼: 'AB36751277',
      組合商品名: 'Sintrix 500 mg/vial', 藥品八碼: 'SIN1AB20',
      執行人員明細: 'G00001王甲乙', 頻率: 'QD', 執行次數: 1,
      執行次數明細: '2026/07/23 09:00', 開始日: '20260723',
      結束日: '20260723', 確認日期: '20260723',
      '39029C管理費數量': 1,
    };
    const analysis = analyze([{ name: '1150725_OPAT個案資料g.xlsx', rows: [
      original, { ...original, 執行次數明細: '2026/07/23 09:02' },
      { ...original, 藥品八碼: 'SAL1FAD0', 組合商品名: '100 Saline inj 0.9% 100 mL /bag' },
    ] }]);
    const included = new Set(['SIN1AB20', 'SAL1FAD0']);
    const workbook = createReportWorkbook(analysis, performance(analysis, '2026-07', included), '2026-07', '竹東', included,
      buildCompletion(analysis, included, new Date(2026, 6, 25)));
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['Step1清理資料'])).toHaveLength(1);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets['施打明細'])).toHaveLength(1);
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['醫師開立偏好']).map(row => row.藥品八碼))
      .toEqual(['SIN1AB20']);
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['重複醫令核對'])[0])
      .toMatchObject({ 判定: '已排除重複列', 開始日: '20260723', 結束日: '20260723', 來源列號: 3, 對照列號: 2 });
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['資料檢核'])[0])
      .toMatchObject({ 類型: 'duplicate-order', 來源檔案: '1150725_OPAT個案資料g.xlsx', 來源列號: 3 });
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets['Step2原系統格式'])[0])
      .toMatchObject({ nursing: 1, pharmacy: 1 });
  });
});
