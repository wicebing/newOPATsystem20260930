import { CAMPUSES, formatDate, snapshotDateFromFilename } from './opat';
import type { Analysis, Campus } from './opat';

export const NHI_UNIT_POINTS = { injectionOnce: 1031, injectionMultiple: 1234, management: 500 } as const;
type ClaimType = keyof typeof NHI_UNIT_POINTS;

export interface NhiPointsRow {
  campus: Campus;
  injectionOnce: number;
  injectionMultiple: number;
  management: number;
  injectionOncePoints: number;
  injectionMultiplePoints: number;
  managementPoints: number;
  totalPoints: number;
}

export function nhiPoints(analysis: Analysis, month: string): NhiPointsRow[] {
  // Claim quantities repeat on drug and diluent rows; use one quantity per account and code from the newest export.
  const claims = new Map<string, { campus: Campus; type: ClaimType; quantity: number; month: string; snapshot: number }>();
  const snapshotDates = new Map<string, number>();

  analysis.records.forEach(row => {
    if (!row.account) return;
    if (!snapshotDates.has(row.file)) snapshotDates.set(row.file, snapshotDateFromFilename(row.file)?.getTime() || 0);
    const snapshot = snapshotDates.get(row.file)!;
    const claimDate = row.visitDate || row.confirmDate || row.startDate;
    const claimMonth = claimDate ? formatDate(claimDate).slice(0, 7) : '日期未明';
    const quantities = [
      ['injectionOnce', row.injectionOnceClaimCount],
      ['injectionMultiple', row.injectionMultipleClaimCount],
      ['management', row.treatment.includes('門診轉OPAT「D1」') ? 0 : row.feeCount],
    ] as const;
    quantities.forEach(([type, quantity]) => {
      const key = `${row.campus}|${row.account}|${type}`;
      const current = claims.get(key);
      if (!current || snapshot > current.snapshot ||
        (snapshot === current.snapshot && (quantity > current.quantity || current.month === '日期未明' && claimMonth !== '日期未明'))) {
        claims.set(key, { campus: row.campus, type, quantity, month: claimMonth, snapshot });
      }
    });
  });

  const campuses: Campus[] = [...CAMPUSES];
  if ([...claims.values()].some(claim => claim.campus === '未判定' && claim.quantity > 0)) campuses.push('未判定');
  return campuses.map(campus => {
    const quantities = { injectionOnce: 0, injectionMultiple: 0, management: 0 };
    claims.forEach(claim => {
      if (claim.campus === campus && (month === 'all' || claim.month === month)) quantities[claim.type] += claim.quantity;
    });
    const injectionOncePoints = quantities.injectionOnce * NHI_UNIT_POINTS.injectionOnce;
    const injectionMultiplePoints = quantities.injectionMultiple * NHI_UNIT_POINTS.injectionMultiple;
    const managementPoints = quantities.management * NHI_UNIT_POINTS.management;
    return { campus, ...quantities, injectionOncePoints, injectionMultiplePoints, managementPoints,
      totalPoints: injectionOncePoints + injectionMultiplePoints + managementPoints };
  });
}
