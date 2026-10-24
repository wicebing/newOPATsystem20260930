// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import { readExcelFiles } from './lib/excel';

vi.mock('./lib/excel', () => ({ readExcelFiles: vi.fn(async () => []) }));

const reader = vi.mocked(readExcelFiles);

beforeEach(() => reader.mockClear());
afterEach(cleanup);

describe('Excel import queue', () => {
  it('accumulates separate selections and analyzes only after clicking the button', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const g = new File(['g'], 'g.xlsx');
    const h = new File(['h'], 'h.xlsx');

    fireEvent.change(input, { target: { files: [g] } });
    expect(screen.getByText('已加入 1 個 Excel 檔案')).toBeTruthy();
    expect(reader).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [h] } });
    expect(screen.getByText('已加入 2 個 Excel 檔案')).toBeTruthy();
    expect(screen.getByText('g.xlsx')).toBeTruthy();
    expect(screen.getByText('h.xlsx')).toBeTruthy();
    expect(reader).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '開始分析' }));
    await waitFor(() => expect(reader).toHaveBeenCalledWith([g, h]));
  });

  it('removes a queued file without starting analysis', async () => {
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const g = new File(['g'], 'g.xlsx');
    const h = new File(['h'], 'h.xlsx');

    fireEvent.change(input, { target: { files: [g, h] } });
    fireEvent.click(screen.getByRole('button', { name: '移除 g.xlsx' }));
    expect(screen.getByText('已加入 1 個 Excel 檔案')).toBeTruthy();
    expect(reader).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '開始分析' }));
    await waitFor(() => expect(reader).toHaveBeenCalledWith([h]));
  });

  it('shows the executor and patient for an analyzed injection', async () => {
    reader.mockResolvedValueOnce([{ name: '1150725_OPAT個案資料g.xlsx', rows: [{
      帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東',
      診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
      藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 1,
      執行次數明細: '2026/07/23 09:00', 執行人員明細: 'G00001王甲乙',
      開始日: '20260723', 結束日: '20260723', '39029C管理費數量': 0,
    }] }]);
    const { container } = render(<App />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['g'], '1150725_OPAT個案資料g.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: '開始分析' }));
    await screen.findByText(/已載入 1 筆原始資料、1 個療程/);

    fireEvent.click(screen.getAllByRole('button', { name: '執行人員' })[0]);
    expect(screen.getByRole('button', { name: '王甲乙' })).toBeTruthy();
    expect(screen.getByText('G000001')).toBeTruthy();
    expect(screen.getByText('26T70000001')).toBeTruthy();
  });

  it('keeps a scheduled but unexecuted course visible in its due month', async () => {
    reader.mockResolvedValueOnce([{ name: '1150804_OPAT個案資料g.xlsx', rows: [{
      帳號: '26T70000002', 病歷號: 'G000002', 院區: '竹東',
      診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
      藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 0,
      執行次數明細: '', 執行人員明細: '', 確認日期: '20260723',
      開始日: '20260802', 結束日: '20260803', '39029C管理費數量': 0,
    }] }]);
    const { container } = render(<App />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [new File(['g'], '1150804_OPAT個案資料g.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: '開始分析' }));
    await screen.findByText(/已載入 1 筆原始資料、1 個療程/);
    expect((screen.getByLabelText('績效月份') as HTMLSelectElement).value).toBe('2026-08');

    fireEvent.click(screen.getAllByRole('button', { name: '個案明細' })[0]);
    expect(screen.getByText('G000002')).toBeTruthy();
    expect(screen.getByText('未完成')).toBeTruthy();
  });

  it('opens an October 1 snapshot on the September performance month', async () => {
    reader.mockResolvedValueOnce([{ name: '1151001_OPAT個案資料g.xlsx', rows: [{
      帳號: '26T70000001', 病歷號: 'G000001', 院區: '竹東',
      診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
      藥品八碼: 'SIN1AB20', 頻率: 'QD', 執行次數: 1,
      執行次數明細: '2026/09/30 09:00', 確認日期: '20260930',
      開始日: '20260930', 結束日: '20261001', '39029C管理費數量': 0,
    }] }]);
    const { container } = render(<App />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [new File(['g'], '1151001_OPAT個案資料g.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: '開始分析' }));
    await screen.findByText(/已載入 1 筆原始資料、1 個療程/);
    expect((screen.getByLabelText('績效月份') as HTMLSelectElement).value).toBe('2026-09');
    expect(screen.queryByRole('heading', { name: '每週開立新療程' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: '開立分析' })[0]);
    expect(screen.getByRole('heading', { name: '每週開立新療程' })).toBeTruthy();
  });

  it('shows the prescriber and drug in the non-QD order list', async () => {
    reader.mockResolvedValueOnce([{ name: '1150908_OPAT個案資料g.xlsx', rows: [{
      帳號: '26T70000021', 病歷號: 'G000021', 院區: '竹東', 看診醫師: '測試醫師丙', 科別: '內科部',
      診療行為: '門診轉OPAT「D1」', 組合商品名: 'Sintrix 500 mg/vial',
      藥品八碼: 'SIN1AB20', 頻率: 'Q12H', 執行次數: 2,
      執行次數明細: '2026/09/01 09:00, 2026/09/01 21:00',
      開始日: '20260901', 結束日: '20260901', '39029C管理費數量': 0,
    }] }]);
    const { container } = render(<App />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement,
      { target: { files: [new File(['g'], '1150908_OPAT個案資料g.xlsx')] } });
    fireEvent.click(screen.getByRole('button', { name: '開始分析' }));
    await screen.findByText(/已載入 1 筆原始資料、1 個療程/);
    const summary = screen.getByRole('heading', { name: '醫令頻率' }).closest('section')!;
    expect(within(summary).getByText('Q12H')).toBeTruthy();
    expect(within(summary).getByText('1 筆')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: '開立分析' })[0]);
    const orderSection = screen.getByRole('heading', { name: '非 QD 醫令明細' }).closest('section')!;
    expect(within(orderSection).getByText('測試醫師丙')).toBeTruthy();
    expect(within(orderSection).getByText('Sintrix 500 mg/vial')).toBeTruthy();
    expect(within(orderSection).getByText('Q12H')).toBeTruthy();
  });
});
