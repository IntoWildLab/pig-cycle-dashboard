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
    cutoff: "2026-08-21",
    pageUpdatedDate: "2026-08-23",
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
    unit: "元", latest: 39.07, latestDate: "2026-08-21", change: -1.88,
    marketStatus: "officialClose", sourceName: "英为财情历史行情（每日收盘字段）",
    sourceUrl: "https://cn.investing.com/equities/muyuan-foodstuff-a-historical-data", history: historyById.muyuan,
  },
  {
    id: "wens", name: "温氏股份", code: "300498", kind: "公司", color: "#d99b2b",
    unit: "元", latest: 13.59, latestDate: "2026-08-21", change: -1.45,
    marketStatus: "officialClose", sourceName: "英为财情历史行情（每日收盘字段）",
    sourceUrl: "https://cn.investing.com/equities/guangdong-wens-foodstuff-historical-data", history: historyById.wens,
  },
  {
    id: "newhope", name: "新希望", code: "000876", kind: "公司", color: "#4c9273",
    unit: "元", latest: 6.90, latestDate: "2026-08-21", change: -1.85,
    marketStatus: "officialClose", sourceName: "英为财情历史行情（每日收盘字段）",
    sourceUrl: "https://cn.investing.com/equities/new-hope-liuhe-a-historical-data", history: historyById.newhope,
  },
  {
    id: "shennong", name: "神农集团", code: "605296", kind: "公司", color: "#4f7fa8",
    unit: "元", latest: 30.23, latestDate: "2026-08-21", change: -0.62,
    marketStatus: "officialClose", sourceName: "英为财情历史行情（每日收盘字段）",
    sourceUrl: "https://cn.investing.com/equities/shennong-agricultural-industry-historical-data", history: historyById.shennong,
  },
  {
    id: "etf", name: "畜牧ETF", code: "159867", kind: "ETF", color: "#7867a4",
    unit: "元", latest: 0.541, latestDate: "2026-08-21", change: -1.64,
    marketStatus: "officialClose", sourceName: "英为财情历史行情（每日交易收盘价）",
    sourceUrl: "https://cn.investing.com/etfs/159867-historical-data", history: historyById.etf,
    nav: { value: 0.5505, date: "2026-08-20", sourceUrl: "https://fund.eastmoney.com/cnjy_jzzzl.html" },
  },
];
