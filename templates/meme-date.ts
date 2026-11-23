const namedDates: Readonly<Record<string, number>> = {
  今天: 0, 今日: 0, 昨天: -1, 昨日: -1, 前天: -2, 大前天: -3, 明天: 1, 明日: 1, 后天: 2, 大后天: 3, 上周: -7, 下周: 7,
  today: 0, yesterday: -1, tomorrow: 1,
};
const chineseTimeUnits: Readonly<Record<string, string>> = {
  年: "year", 月: "month", 个月: "month", 周: "week", 星期: "week", 天: "day", 日: "day",
  小时: "hour", 分钟: "minute",
};

function monthLastDay(year: number, month: number) {
  const date = new Date(0);
  date.setFullYear(year, month + 1, 0);
  return date.getDate();
}

function moveDate(date: Date, unit: string, amount: number) {
  if (unit === "year" || unit === "month") {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + amount * (unit === "year" ? 12 : 1));
    date.setDate(Math.min(day, monthLastDay(date.getFullYear(), date.getMonth())));
  } else if (unit === "day" || unit === "week") {
    date.setDate(date.getDate() + amount * (unit === "week" ? 7 : 1));
  } else {
    date.setMinutes(date.getMinutes() + amount * (unit === "hour" ? 60 : 1));
  }
  return date;
}

export function readMemeDate(value: unknown, baseline = new Date()) {
  const now = new Date(baseline);
  if (typeof value !== "string" || !value.trim() || value.length > 96) return now;
  const text = value.normalize("NFKC").trim().toLowerCase();
  if (Object.hasOwn(namedDates, text)) return moveDate(now, "day", namedDates[text]!);
  if (text === "上个月" || text === "下个月") return moveDate(now, "month", text.startsWith("上") ? -1 : 1);
  const weekday = /^(上|本|下)?(?:周|星期)([日天一二三四五六])$/u.exec(text);
  if (weekday) {
    const wanted = "一二三四五六日".indexOf(weekday[2] === "天" ? "日" : weekday[2]!);
    const actual = (now.getDay() + 6) % 7;
    const offset = weekday[1] === "下" ? 7 : weekday[1] === "上" ? -7 : 0;
    return moveDate(now, "day", wanted - actual + offset);
  }
  const chinese = /^(\d{1,4})\s*(年|个月|月|周|星期|天|日|小时|分钟)\s*(前|后)$/u.exec(text);
  if (chinese) return moveDate(now, chineseTimeUnits[chinese[2]!]!, Number(chinese[1]) * (chinese[3] === "前" ? -1 : 1));
  const english = /^(in\s+)?(\d{1,4})\s+(year|month|week|day|hour|minute)s?(\s+ago)?$/u.exec(text);
  if (english && !(english[1] && english[4])) return moveDate(now, english[3]!, Number(english[2]) * (english[4] ? -1 : 1));

  function calendar(year: number, month: number, day: number) {
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLastDay(year, month - 1)) return now;
    const result = new Date(now);
    result.setFullYear(year, month - 1, day);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  const isoTime = /^(\d{4})-(\d{2})-(\d{2})[t ]\d{2}:\d{2}/u.exec(text);
  if (isoTime) return Number.isFinite(Date.parse(text)) ? calendar(Number(isoTime[1]), Number(isoTime[2]), Number(isoTime[3])) : now;
  const date = /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?:日|号)?$/u.exec(text);
  if (date) return calendar(Number(date[1]), Number(date[2]), Number(date[3]));
  const partial = /^(\d{1,2})[-/.月](\d{1,2})(?:日|号)?$/u.exec(text);
  if (partial) return calendar(now.getFullYear(), Number(partial[1]), Number(partial[2]));
  const month = /^(\d{4})[-/.年](\d{1,2})月?$/u.exec(text);
  if (month) return calendar(Number(month[1]), Number(month[2]),
    Math.min(now.getDate(), monthLastDay(Number(month[1]), Number(month[2]) - 1)));
  if (/[a-z]{3}/u.test(text)) {
    const parsed = new Date(text);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return now;
}
