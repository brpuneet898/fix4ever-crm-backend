import dayjs from "dayjs";

export function now(): Date {
  return new Date();
}

export function addDays(date: Date, days: number): Date {
  return dayjs(date).add(days, "day").toDate();
}

export function addHours(date: Date, hours: number): Date {
  return dayjs(date).add(hours, "hour").toDate();
}

export function isExpired(date: Date): boolean {
  return dayjs(date).isBefore(dayjs());
}

export function formatDate(date: Date, format = "YYYY-MM-DD HH:mm:ss"): string {
  return dayjs(date).format(format);
}
