import type { Lease, LeaseStatus } from './types';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DAY = 86400000;

export function naira(n: number): string {
  return '₦' + Math.round(n).toLocaleString('en-NG');
}

export function nairaCompact(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return '₦' + (v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2).replace(/\.?0+$/, '')) + 'm';
  }
  if (n >= 1_000) return '₦' + Math.round(n / 1_000) + 'k';
  return '₦' + Math.round(n);
}

export function parseDate(iso: string): Date {
  return new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}

/** 4 Oct 2026 */
export function fmtDate(iso?: string): string {
  if (!iso) return '—';
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 24 Sep */
export function fmtShort(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** 01 Oct 2026 */
export function fmtPadded(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** 14 / 06 / 1991 */
export function fmtSlash(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`;
}

export function fmtTime(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 24 Sep, 08:31 */
export function fmtStamp(iso: string): string {
  return `${fmtShort(iso)}, ${fmtTime(iso)}`;
}

export function longToday(): string {
  const d = new Date();
  return `${DAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

export function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = parseDate(iso);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / DAY);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY);
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - parseDate(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtShort(iso);
}

/** Label used in notification lists: 08:14 today, "Mon" this week, else date */
export function feedStamp(iso: string): string {
  const d = parseDate(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / DAY);
  if (diffDays < 1 && new Date().getDate() === d.getDate()) return fmtTime(iso);
  if (diffDays < 1) return 'Yesterday';
  if (diffDays < 7) return DAYS_FULL[d.getDay()].slice(0, 3);
  return fmtShort(iso);
}

export function isToday(iso: string): boolean {
  const d = parseDate(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export function leaseStatus(l: Lease): LeaseStatus {
  if (l.draft) return 'draft';
  if (l.terminated) return 'terminated';
  if (l.renewedTo) return 'renewed';
  const d = daysUntil(l.end);
  if (d < 0) return 'expired';
  if (d <= 90) return 'expiring';
  return 'active';
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

export function firstName(name: string): string {
  return name.split(' ')[0];
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function pct(n: number, d: number, digits = 1): string {
  if (!d) return '0%';
  const v = (n / d) * 100;
  return (v === 100 ? '100' : v.toFixed(digits)) + '%';
}

export function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

export function maskPhone(p: string): string {
  const digits = p.replace(/\s/g, '');
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ••• ${digits.slice(-4)}`;
}

export function maskEmail(e: string): string {
  const [u, d] = e.split('@');
  return `${u[0]}••••••@${d}`;
}

export function passwordScore(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return s;
}
