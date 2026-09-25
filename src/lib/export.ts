import { Platform } from 'react-native';

/** Download rows as CSV in the browser. Returns false where downloads aren't supported (native). */
export function downloadCSV(filename: string, rows: Array<Record<string, string | number | undefined>>): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !rows.length) return false;
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

/** Open the browser print dialog (used for "Export PDF"). */
export function printPage(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  window.print();
  return true;
}
