export const DEVICE_ID = 'demo-device';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDay(ms: number) {
  const date = new Date(ms);
  const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return date.getFullYear() === new Date().getFullYear() ? label : `${label}, ${date.getFullYear()}`;
}

export function formatDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

type Rung = { weeks: number };

export function rungDates(goal: { startedAt?: number; projectedFinish?: number }, rungs: Rung[]) {
  const total = rungs.reduce((sum, r) => sum + r.weeks, 0);
  if (!goal.startedAt || !goal.projectedFinish || total === 0) return rungs.map(() => null);
  const scale = (goal.projectedFinish - goal.startedAt) / (total * WEEK);
  let elapsed = 0;
  return rungs.map((r) => {
    elapsed += r.weeks;
    return goal.startedAt! + elapsed * WEEK * scale;
  });
}
