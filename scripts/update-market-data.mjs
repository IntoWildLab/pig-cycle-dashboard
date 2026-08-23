import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MARKET_INSTRUMENTS = [
  { id: "muyuan", name: "牧原股份", code: "002714", secid: "0.002714", decimals: 2 },
  { id: "wens", name: "温氏股份", code: "300498", secid: "0.300498", decimals: 2 },
  { id: "newhope", name: "新希望", code: "000876", secid: "0.000876", decimals: 2 },
  { id: "shennong", name: "神农集团", code: "605296", secid: "1.605296", decimals: 2 },
  { id: "etf", name: "畜牧ETF", code: "159867", secid: "0.159867", decimals: 3 },
];

const DEFAULT_HISTORY_FILE = fileURLToPath(
  new URL("../app/marketHistory.ts", import.meta.url),
);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function addCalendarDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function includesWeekday(beginDate, endDate) {
  for (let date = beginDate; date <= endDate; date = addCalendarDays(date, 1)) {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (day >= 1 && day <= 5) {
      return true;
    }
  }
  return false;
}

export function latestCompletedShanghaiDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const shanghaiDate = `${values.year}-${values.month}-${values.day}`;
  const minutesAfterMidnight = Number(values.hour) * 60 + Number(values.minute);

  // The scheduled run is at 18:30 China time. This guard also prevents a manual
  // intraday run from accepting a still-forming daily candle as a formal close.
  return minutesAfterMidnight >= 16 * 60
    ? shanghaiDate
    : addCalendarDays(shanghaiDate, -1);
}

function locateSeriesArray(source, id) {
  const opening = new RegExp(`^  ${id}: \\[\\r?\\n`, "m").exec(source);
  if (!opening) {
    throw new Error(`Could not find history array for ${id}`);
  }

  const contentStart = opening.index + opening[0].length;
  const closing = /\r?\n  \],/.exec(source.slice(contentStart));
  if (!closing) {
    throw new Error(`Could not find the end of history array for ${id}`);
  }

  return { contentStart, contentEnd: contentStart + closing.index };
}

export function parseMarketHistories(source) {
  return Object.fromEntries(MARKET_INSTRUMENTS.map((instrument) => {
    const { contentStart, contentEnd } = locateSeriesArray(source, instrument.id);
    const content = source.slice(contentStart, contentEnd);
    const points = [];
    const pattern = /\{ date: "(\d{4}-\d{2}-\d{2})", value: (-?\d+(?:\.\d+)?) \}/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      points.push({ date: match[1], close: Number(match[2]) });
    }

    validatePoints(points, `${instrument.name} existing history`);
    return [instrument.id, points];
  }));
}

function validatePoints(points, label) {
  if (points.length === 0) {
    throw new Error(`${label} is empty`);
  }

  let previousDate = "";
  for (const point of points) {
    if (!ISO_DATE_PATTERN.test(point.date)) {
      throw new Error(`${label} contains invalid date: ${point.date}`);
    }
    if (!Number.isFinite(point.close) || point.close <= 0) {
      throw new Error(`${label} contains invalid close for ${point.date}`);
    }
    if (point.date <= previousDate) {
      throw new Error(`${label} must be strictly ascending with unique dates`);
    }
    previousDate = point.date;
  }
}

async function fetchJsonWithRetry(url, fetchImpl, attempts = 3) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://quote.eastmoney.com/",
          "User-Agent": "pig-cycle-dashboard-market-updater/1.0",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      }
    }
  }

  throw lastError;
}

export async function fetchEastmoneyHistory(
  instrument,
  beginDate,
  endDate,
  fetchImpl = fetch,
) {
  const query = new URLSearchParams({
    secid: instrument.secid,
    klt: "101",
    fqt: "0",
    beg: beginDate.replaceAll("-", ""),
    end: endDate.replaceAll("-", ""),
    lmt: "1000",
    fields1: "f1,f2,f3,f4,f5,f6",
    fields2: "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
  });
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?${query}`;
  const payload = await fetchJsonWithRetry(url, fetchImpl);

  if (payload?.rc !== 0) {
    throw new Error(`${instrument.name} source returned error code`);
  }
  if (payload.data === null) {
    return [];
  }
  if (payload.data?.code !== instrument.code) {
    throw new Error(`${instrument.name} source returned unexpected code`);
  }
  if (payload.data.klines === null) {
    return [];
  }
  if (!Array.isArray(payload.data.klines)) {
    throw new Error(`${instrument.name} source returned invalid kline data`);
  }

  const points = payload.data.klines.map((line) => {
    const fields = String(line).split(",");
    return { date: fields[0], close: Number(fields[2]) };
  });
  if (points.length > 0) {
    validatePoints(points, `${instrument.name} source history`);
  }
  return points;
}

function sameDates(left, right) {
  return left.length === right.length
    && left.every((date, index) => date === right[index]);
}

function formatClose(value, decimals) {
  return String(Number(value.toFixed(decimals)));
}

function appendPoints(source, additionsById) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const edits = MARKET_INSTRUMENTS.map((instrument) => ({
    instrument,
    range: locateSeriesArray(source, instrument.id),
    additions: additionsById[instrument.id],
  })).sort((left, right) => right.range.contentEnd - left.range.contentEnd);

  let updated = source;
  for (const { instrument, range, additions } of edits) {
    const text = additions.map((point) => (
      `${newline}    { date: "${point.date}", value: ${formatClose(point.close, instrument.decimals)} },`
    )).join("");
    updated = updated.slice(0, range.contentEnd) + text + updated.slice(range.contentEnd);
  }
  return updated;
}

export async function updateMarketData({
  historyFile = DEFAULT_HISTORY_FILE,
  fetchSeries = fetchEastmoneyHistory,
  now = new Date(),
} = {}) {
  const original = await readFile(historyFile, "utf8");
  const histories = parseMarketHistories(original);
  const latestDates = MARKET_INSTRUMENTS.map(({ id }) => histories[id].at(-1).date);

  if (!latestDates.every((date) => date === latestDates[0])) {
    throw new Error(`Existing market histories are not synchronized: ${latestDates.join(", ")}`);
  }

  const existingLatestDate = latestDates[0];
  const completedThrough = latestCompletedShanghaiDate(now);
  const beginDate = addCalendarDays(existingLatestDate, 1);
  if (completedThrough <= existingLatestDate || !includesWeekday(beginDate, completedThrough)) {
    return { changed: false, existingLatestDate, completedThrough, addedDates: [] };
  }

  const fetchedEntries = await Promise.all(MARKET_INSTRUMENTS.map(async (instrument) => {
    const sourcePoints = await fetchSeries(instrument, beginDate, completedThrough);
    const newPoints = sourcePoints.filter((point) => (
      point.date > existingLatestDate && point.date <= completedThrough
    ));
    if (newPoints.length > 0) {
      validatePoints(newPoints, `${instrument.name} incremental history`);
    }
    return [instrument.id, newPoints];
  }));
  const additionsById = Object.fromEntries(fetchedEntries);
  const referenceDates = additionsById[MARKET_INSTRUMENTS[0].id].map(({ date }) => date);

  for (const instrument of MARKET_INSTRUMENTS.slice(1)) {
    const dates = additionsById[instrument.id].map(({ date }) => date);
    if (!sameDates(referenceDates, dates)) {
      throw new Error(
        `Source dates are not synchronized: ${MARKET_INSTRUMENTS[0].id}=${referenceDates.join(",") || "none"}; `
        + `${instrument.id}=${dates.join(",") || "none"}`,
      );
    }
  }

  if (referenceDates.length === 0) {
    return { changed: false, existingLatestDate, completedThrough, addedDates: [] };
  }

  const updated = appendPoints(original, additionsById);
  parseMarketHistories(updated);
  await writeFile(historyFile, updated, "utf8");

  return {
    changed: true,
    existingLatestDate,
    completedThrough,
    addedDates: referenceDates,
  };
}

async function main() {
  const result = await updateMarketData();
  if (!result.changed) {
    console.log(`No new market data. Existing latest date: ${result.existingLatestDate}.`);
    return;
  }
  console.log(`New market data found: ${result.addedDates.at(-1)}.`);
  console.log("Updated symbols: 002714, 300498, 000876, 605296, 159867");
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(`Market data update failed: ${error.message}`);
    process.exitCode = 1;
  });
}
