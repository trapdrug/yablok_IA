export function fmtDate(isoStr: string | null | undefined): string {
  if (!isoStr) return 'неизвестно';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return String(isoStr);
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}.${get('month')} ${get('hour')}:${get('minute')}`;
}

export function fmtDateInput(d: Date): string {
  // для datetime-local: YYYY-MM-DDTHH:MM в МСК — упрощённо локальное
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toIsoMoscow(localStr: string): string {
  // datetime-local -> ISO с +03:00 (учебное МСК)
  // localStr вида 2026-11-05T10:00
  if (/[+-]\d{2}:?\d{2}$|Z$/.test(localStr)) return localStr;
  return `${localStr}:00+03:00`;
}
