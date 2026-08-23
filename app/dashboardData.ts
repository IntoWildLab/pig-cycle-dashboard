import { historyById } from "./marketHistory";

export type Point = { date: string; value: number };
export type MarketStatus = "officialClose" | "sampleObservation" | "stale";
export type Series = {
  id: string;
  name: string;
  code: string;
  kind: "行业" | "公司" | "ETF";
  color: string;
  unit: string;
  latest: number;
  latestDate: string;
  change: number;
  marketStatus: MarketStatus;
  sourceName: string;
  sourceUrl: string;
  history: Point[];
  nav?: { value: number; date: string; sourceUrl: string };
};

function officialCloseSnapshot(history: Point[]) {
  if (history.length < 2) {
    throw new Error("Official close history requires at least two points");
  }
  const previous = history[history.length - 2];
  const latest = history[history.length - 1];
  return {
    latest: latest.value,
    latestDate: latest.date,
    change: (latest.value / previous.value - 1) * 100,
  };
}

const marketSnapshots = {
  muyuan: officialCloseSnapshot(historyById.muyuan),
  wens: officialCloseSnapshot(historyById.wens),
  newhope: officialCloseSnapshot(historyById.newhope),
  shennong: officialCloseSnapshot(historyById.shennong),
  etf: officialCloseSnapshot(historyById.etf),
};
const marketCutoff = marketSnapshots.muyuan.latestDate;

if (!Object.values(marketSnapshots).every(({ latestDate }) => latestDate === marketCutoff)) {
  throw new Error("Official close histories must share the same latest date");
}

export const dashboardData = {
  profit: {
    value: -190.25,
    unit: "元/头",
    date: "2026.07.23",
    periodLabel: "7 月下旬样本",
    source: "公开行业样本",
    url: "https://stock.finance.sina.com.cn/stock/go.php/vReport_Show/kind/search/rptid/838476333741/index.phtml",
  },
  sow: {
    count: 3780,
    unit: "万头",
    yoy: -6.5,
    date: "2026 Q2 末",
    source: "国家统计局",
    url: "https://www.stats.gov.cn/sj/zxfbhjd/202607/t20260716_1964140.html",
  },
  piglet: {
    price: 22.42,
    unit: "元/公斤",
    wow: -2.5,
    date: "2026.08 第 1 周",
    source: "农业农村部",
    url: "https://xmsyj.moa.gov.cn/jcyj/202608/t20260811_6486584.htm",
  },
  pigGrainRatio: {
    value: 4.64,
    pigPrice: 11.15,
    cornPrice: 2.405,
    date: "2026.08.23",
    source: "中国养猪网价格页",
    url: "https://zhujia.zhuwang.com.cn/indexov.shtml",
  },
  feed: {
    price: 3.35,
    wow: -0.3,
    date: "2026.08 第 1 周",
    source: "农业农村部",
    url: "https://xmsyj.moa.gov.cn/jcyj/202608/t20260811_6486584.htm",
  },
  market: {
    cutoff: marketCutoff,
    pageUpdatedDate: marketCutoff,
  },
} as const;

// 证券序列只保存交易所正式收盘价；ETF NAV 仅作辅助信息，不参与任何比较。
// 猪价序列只保存可核验的真实观察点，不插值、不补造日频数据。
export const series: Series[] = [
  {
    id: "pig", name: "全国外三元", code: "公开报价样本", kind: "行业", color: "#d45a42",
    unit: "元/公斤", latest: dashboardData.pigGrainRatio.pigPrice, latestDate: "2026-08-23", change: 0.03,
    marketStatus: "sampleObservation", sourceName: "中国养猪网价格页",
    sourceUrl: "https://zhujia.zhuwang.com.cn/indexov.shtml", history: historyById.pig,
  },
  {
    id: "muyuan", name: "牧原股份", code: "002714", kind: "公司", color: "#ca7348",
    unit: "元", ...marketSnapshots.muyuan,
    marketStatus: "officialClose", sourceName: "东方财富历史行情（未复权日 K 收盘）",
    sourceUrl: "https://quote.eastmoney.com/sz002714.html", history: historyById.muyuan,
  },
  {
    id: "wens", name: "温氏股份", code: "300498", kind: "公司", color: "#d99b2b",
    unit: "元", ...marketSnapshots.wens,
    marketStatus: "officialClose", sourceName: "东方财富历史行情（未复权日 K 收盘）",
    sourceUrl: "https://quote.eastmoney.com/sz300498.html", history: historyById.wens,
  },
  {
    id: "newhope", name: "新希望", code: "000876", kind: "公司", color: "#4c9273",
    unit: "元", ...marketSnapshots.newhope,
    marketStatus: "officialClose", sourceName: "东方财富历史行情（未复权日 K 收盘）",
    sourceUrl: "https://quote.eastmoney.com/sz000876.html", history: historyById.newhope,
  },
  {
    id: "shennong", name: "神农集团", code: "605296", kind: "公司", color: "#4f7fa8",
    unit: "元", ...marketSnapshots.shennong,
    marketStatus: "officialClose", sourceName: "东方财富历史行情（未复权日 K 收盘）",
    sourceUrl: "https://quote.eastmoney.com/sh605296.html", history: historyById.shennong,
  },
  {
    id: "etf", name: "畜牧ETF", code: "159867", kind: "ETF", color: "#7867a4",
    unit: "元", ...marketSnapshots.etf,
    marketStatus: "officialClose", sourceName: "东方财富历史行情（未复权日 K 交易收盘）",
    sourceUrl: "https://quote.eastmoney.com/sz159867.html", history: historyById.etf,
    nav: { value: 0.5505, date: "2026-08-20", sourceUrl: "https://fund.eastmoney.com/cnjy_jzzzl.html" },
  },
];
