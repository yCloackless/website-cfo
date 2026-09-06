export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Returns the Monday Date object for the week containing the given date.
 * If today is Sunday (day 0), Monday was 6 days ago.
 */
export function getMondayOfWeek(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Returns array of 7 dates (Monday through Sunday) starting from the given Monday.
 */
export function getWeekDaysList(monday: Date): Array<{ index: number; dateStr: string; displayShort: string; isToday: boolean }> {
  const todayStr = toISODate(new Date());
  const list = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const dateStr = toISODate(d);
    const dayOfMonth = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    list.push({
      index: i,
      dateStr,
      displayShort: `${dayOfMonth}/${month}`,
      isToday: dateStr === todayStr,
    });
  }
  return list;
}

export function addDays(dateStr: string, days: number): string {
  const d = parseISODate(dateStr);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function formatBRDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function formatBRDateShort(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  return `${parts[2]}/${parts[1]}`;
}

export function getWeekRangeLabel(mondayDate: Date): string {
  const sunday = new Date(mondayDate);
  sunday.setDate(sunday.getDate() + 6);
  const startDay = String(mondayDate.getDate()).padStart(2, '0');
  const startMonth = String(mondayDate.getMonth() + 1).padStart(2, '0');
  const endDay = String(sunday.getDate()).padStart(2, '0');
  const endMonth = String(sunday.getMonth() + 1).padStart(2, '0');
  const year = sunday.getFullYear();
  return `Semana ${startDay}/${startMonth} a ${endDay}/${endMonth}/${year}`;
}

export function isPastDate(dateStr: string): boolean {
  const todayStr = toISODate(new Date());
  return dateStr < todayStr;
}

export function isFutureDate(dateStr: string): boolean {
  const todayStr = toISODate(new Date());
  return dateStr > todayStr;
}

export function isTodayDate(dateStr: string): boolean {
  const todayStr = toISODate(new Date());
  return dateStr === todayStr;
}

/**
 * Formats minutes into integer hours representation (e.g. 60m -> 1h, 120m -> 2h, 180m -> 3h, 300m -> 5h)
 * Eliminates fractional / broken decimals.
 */
export function formatDurationHours(minutes?: number): string {
  if (!minutes || minutes <= 0) return '0h';
  const hours = Math.max(1, Math.round(minutes / 60));
  return `${hours}h`;
}
