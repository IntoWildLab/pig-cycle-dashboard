"use client";

import { useMemo, useState } from "react";
import { deriveCycleSignals } from "./cycleSignals";
import { dashboardData, series, type Point, type Series } from "./dashboardData";

type ComparisonItem = Series & {
  startValue: number;
  endValue: number;
  intervalReturn: number;
  pigIntervalReturn: number;
  relativeToPig: number;
  points: (Point & { normalized: number })[];
};
type ComparisonResult = {
  startDate: string | null;
  endDate: string | null;
  commonDates: string[];
  items: ComparisonItem[];
  excluded: Series[];
  warning: string | null;
};
type PriceView = {
  item: Series;
  points: Point[];
  startDate: string | null;
  endDate: string | null;
  startValue: number | null;
  endValue: number | null;
  intervalReturn: number | null;
  high: Point | null;
  low: Point | null;
  trend: "up" | "down" | "flat" | "insufficient";
  trendReturn: number | null;
  warning: string | null;
};

const MARKET_CUTOFF = dashboardData.market.cutoff;
const PAGE_UPDATED_DATE = dashboardData.market.pageUpdatedDate;
const TREND_THRESHOLD = 1;

const rangeStartBoundary: Record<string, string> = {
  "1周": "2026-08-13",
  "1月": "2026-07-20",
  "3月": "2026-05-20",
};

const timelineEvents = [
  { date: "04.14", type: "猪价拐点", tone: "turn", title: "阶段底点 8.59 元/公斤", note: "三个月窗口外参考；随后猪价缓慢修复。" },
  { date: "06.05", type: "经营数据", tone: "report", title: "牧原发布 5 月销售简报", note: "销售均价仍在低位，跟踪成本领先优势。" },
  { date: "07.09", type: "猪价拐点", tone: "turn", title: "全国生猪 11.35 元/公斤", note: "周度样本阶段高点，之后回落。" },
  { date: "07.16", type: "产能政策", tone: "policy", title: `Q2 能繁母猪 ${dashboardData.sow.count} 万头`, note: `同比${dashboardData.sow.yoy < 0 ? "下降" : "上升"} ${Math.abs(dashboardData.sow.yoy).toFixed(1)}%，为正常保有量的 100.8%。` },
  { date: "08.20", type: "财报日历", tone: "report", title: "牧原 2026 半年报预约披露日", note: "已到预约日期，待核验披露结果；重点看完全成本、亏损与现金流。" },
];

const metrics = [
  {
    icon: "pig" as const, label: "全国外三元", value: dashboardData.pigGrainRatio.pigPrice.toFixed(2), unit: "元/公斤", delta: "+0.03", date: series.find((item) => item.id === "pig")!.latestDate,
    tone: "price-up", impactTone: "favorable", impact: "卖猪收入通常改善",
    source: "中国养猪网价格页", sourceUrl: "https://zhujia.zhuwang.com.cn/indexov.shtml",
    scope: "全国外三元公开报价样本 · 非政府统计",
    explanation: "外三元是国内生猪市场常用的商品猪价格参考。这里保留来源页面的公开报价样本口径，不等于全国政府统计均价或某家猪企的实际结算价。",
  },
  {
    icon: "grain" as const, label: "全国玉米平均价格", value: "2,470", unit: "元/吨", delta: "环比持平", date: "2026.08 第1周",
    tone: "cost-down", impactTone: "pressure", impact: "育肥成本通常上升",
    source: "农业农村部", sourceUrl: "https://xmsyj.moa.gov.cn/jcyj/202608/t20260811_6486584.htm",
    scope: "全国县级集贸市场和采集点监测口径",
    explanation: "农业农村部全国监测系列中的玉米平均价格为 2.47 元/公斤，页面统一换算为 2,470 元/吨。后续沿用同一官方周度序列，避免与局部现货报价混用。",
  },
  {
    icon: "meal" as const, label: "全国豆粕平均价格", value: "3,230", unit: "元/吨", delta: "环比持平", date: "2026.08 第1周",
    tone: "cost-up", impactTone: "pressure", impact: "蛋白饲料成本上升",
    source: "农业农村部", sourceUrl: "https://xmsyj.moa.gov.cn/jcyj/202608/t20260811_6486584.htm",
    scope: "全国县级集贸市场和采集点监测口径",
    explanation: "农业农村部全国监测系列中的豆粕平均价格为 3.23 元/公斤，页面统一换算为 3,230 元/吨。与玉米、育肥猪配合饲料来自同一周度数据体系。",
  },
  {
    icon: "ratio" as const, label: "自计算猪粮比", value: dashboardData.pigGrainRatio.value.toFixed(2), unit: ": 1", delta: "非官方值", date: dashboardData.pigGrainRatio.date,
    tone: "warning", impactTone: "favorable", impact: "养殖利润通常改善",
    source: "中国养猪网价格页", sourceUrl: "https://zhujia.zhuwang.com.cn/indexov.shtml",
    scope: `${dashboardData.pigGrainRatio.pigPrice.toFixed(2)} 元/公斤 ÷ ${dashboardData.pigGrainRatio.cornPrice.toFixed(3)} 元/公斤 ≈ ${dashboardData.pigGrainRatio.value.toFixed(2)}`,
    explanation: `自计算猪粮比 = 同口径全国外三元猪价 ÷ 同口径玉米价格。本期为 ${dashboardData.pigGrainRatio.pigPrice.toFixed(2)} ÷ ${dashboardData.pigGrainRatio.cornPrice.toFixed(3)} ≈ ${dashboardData.pigGrainRatio.value.toFixed(2)}。计算所用玉米价格采用独立现货口径，与首页农业农村部全国玉米监测均价 2,470 元/吨不是同一数据序列；该结果不是政府发布的官方猪粮比。`,
  },
];

type CoreMetricDefinition = {
  label: string; value: string; unit: string; delta: string; date: string; source: string; url: string; meaning: string;
  signal?: "sow" | "profit" | "piglet";
  status?: string;
  tone?: "red" | "yellow" | "green";
};

const staticCoreMetrics: CoreMetricDefinition[] = [
  {
    label: "能繁母猪存栏", value: dashboardData.sow.count.toLocaleString("zh-CN"), unit: dashboardData.sow.unit, delta: `同比 ${formatSigned(dashboardData.sow.yoy)}`, signal: "sow",
    date: dashboardData.sow.date, source: dashboardData.sow.source, url: dashboardData.sow.url,
    meaning: "升高通常意味着约 10 个月后的生猪供给压力增加；持续下降才更利于后续周期修复。",
  },
  {
    label: "自繁自养利润", value: dashboardData.profit.value.toFixed(2), unit: dashboardData.profit.unit, delta: dashboardData.profit.periodLabel, signal: "profit",
    date: dashboardData.profit.date, source: dashboardData.profit.source, url: dashboardData.profit.url,
    meaning: "数值升高、由负转正，代表行业现金流改善；长期亏损通常会推动产能退出。",
  },
  {
    label: "全国仔猪价格", value: dashboardData.piglet.price.toFixed(2), unit: dashboardData.piglet.unit, delta: `环比 ${formatSigned(dashboardData.piglet.wow)}`, signal: "piglet",
    date: dashboardData.piglet.date, source: dashboardData.piglet.source, url: dashboardData.piglet.url,
    meaning: "升高常意味着补栏意愿或预期转强；过快上涨也可能增加未来供给并抬高育肥成本。",
  },
  {
    label: "育肥猪配合饲料", value: dashboardData.feed.price.toFixed(2), unit: "元/公斤", delta: `环比 ${formatSigned(dashboardData.feed.wow)}`, status: "绿灯 · 成本缓降", tone: "green",
    date: dashboardData.feed.date, source: dashboardData.feed.source, url: dashboardData.feed.url,
    meaning: "与玉米、豆粕同属农业农村部全国监测系列；升高会压缩利润，下降有利于成本端。",
  },
  {
    label: "自计算猪粮比", value: dashboardData.pigGrainRatio.value.toFixed(2), unit: ": 1", delta: "非官方口径", status: "红灯 · 亏损压力", tone: "red",
    date: dashboardData.pigGrainRatio.date, source: dashboardData.pigGrainRatio.source, url: dashboardData.pigGrainRatio.url,
    meaning: `按同一来源页的全国外三元 ${dashboardData.pigGrainRatio.pigPrice.toFixed(2)} 元/公斤 ÷ 独立现货口径玉米 ${dashboardData.pigGrainRatio.cornPrice.toFixed(3)} 元/公斤计算；该玉米序列不同于首页农业农村部 2,470 元/吨全国监测均价，也不是官方猪粮比。`,
  },
];

function Icon({ name }: { name: "pig" | "grain" | "meal" | "ratio" | "search" | "calendar" }) {
  const paths = {
    pig: <><path d="M5 11c0-3 2.6-5 6.2-5H14l2-2 1 3c1.8.9 3 2.3 3 4v5h-3l-1 3h-3v-3H9v3H6l-1-4H3v-4h2Z"/><circle cx="15.5" cy="10" r=".7" fill="currentColor"/></>,
    grain: <><path d="M12 21V7"/><path d="M12 11c-4 0-6-2-6-5 4 0 6 2 6 5Zm0 4c4 0 6-2 6-5-4 0-6 2-6 5Zm0 3c-3 0-5-1.5-5-4 3 0 5 1.5 5 4Z"/></>,
    meal: <><path d="M6 9h12l-1 11H7L6 9Z"/><path d="M8 9V5h8v4M9 13h6M10 17h4"/></>,
    ratio: <><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="m18 6-12 12"/></>,
    search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
    calendar: <><rect x="4" y="6" width="16" height="14" rx="2"/><path d="M8 3v6m8-6v6M4 11h16"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function formatSigned(value: number, digits = 1, suffix = "%") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}${suffix}`;
}

function shortDate(date: string | null) {
  return date ? date.slice(5).replace("-", ".") : "—";
}

function valueLabel(item: Series, value: number) {
  if (item.id === "pig") return `${value.toFixed(2)} 元/公斤`;
  if (item.id === "etf") return `${value.toFixed(3)} 元`;
  return `${value.toFixed(2)} 元`;
}

function buildComparison(range: string): ComparisonResult {
  const valid = series.filter((item) => {
    const correctType = item.id === "pig"
      ? item.marketStatus === "sampleObservation"
      : item.marketStatus === "officialClose";
    return correctType
      && (item.id === "pig" || item.latestDate === MARKET_CUTOFF)
      && item.history.some((point) => point.date === MARKET_CUTOFF);
  });
  const excluded = series.filter((item) => !valid.includes(item));
  if (!valid.some((item) => item.id === "pig")) {
    return { startDate: null, endDate: null, commonDates: [], items: [], excluded, warning: "猪价缺少可核验的共同观察点，暂不比较。" };
  }

  const boundary = rangeStartBoundary[range];
  const candidateDates = [...new Set(valid.flatMap((item) => item.history.map((point) => point.date)))]
    .filter((date) => date >= boundary && date <= MARKET_CUTOFF)
    .sort();
  const commonDates = candidateDates.filter((date) =>
    valid.every((item) => item.history.some((point) => point.date === date)),
  );
  if (commonDates.length < 2) {
    return { startDate: null, endDate: null, commonDates, items: [], excluded, warning: "所选区间没有至少两个共同有效观察点，历史数据不足。" };
  }

  const startDate = commonDates[0];
  const endDate = commonDates[commonDates.length - 1];
  const pig = valid.find((item) => item.id === "pig")!;
  const pigStart = pig.history.find((point) => point.date === startDate)!.value;
  const pigEnd = pig.history.find((point) => point.date === endDate)!.value;
  const pigIntervalReturn = (pigEnd / pigStart - 1) * 100;
  const items = valid.map((item) => {
    const usable = item.history.filter((point) => commonDates.includes(point.date));
    const startValue = usable.find((point) => point.date === startDate)!.value;
    const endValue = usable.find((point) => point.date === endDate)!.value;
    const intervalReturn = (endValue / startValue - 1) * 100;
    return {
      ...item,
      startValue,
      endValue,
      intervalReturn,
      pigIntervalReturn,
      relativeToPig: intervalReturn - pigIntervalReturn,
      points: usable.map((point) => ({
        ...point,
        normalized: (point.value / startValue - 1) * 100,
      })),
    };
  });

  return {
    startDate,
    endDate,
    commonDates,
    items,
    excluded,
    warning: excluded.length
      ? `已排除：${excluded.map((item) => `${item.name}（最新有效数据：${item.latestDate}）`).join("、")}。原因：数据滞后或不是正式收盘。`
      : null,
  };
}

function buildPriceView(item: Series, range: string): PriceView {
  const boundary = rangeStartBoundary[range];
  const viewCutoff = item.id === "pig" ? item.latestDate : MARKET_CUTOFF;
  const fullHistory = item.history
    .filter((point) => point.date >= boundary && point.date <= viewCutoff)
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = item.id === "pig"
    ? fullHistory
    : range === "1周"
      ? item.history.filter((point) => point.date <= MARKET_CUTOFF).sort((a, b) => a.date.localeCompare(b.date)).slice(-5)
      : range === "1月"
        ? item.history.filter((point) => point.date <= MARKET_CUTOFF).sort((a, b) => a.date.localeCompare(b.date)).slice(-20)
        : fullHistory;
  const validStatus = item.id === "pig"
    ? item.marketStatus === "sampleObservation"
    : item.marketStatus === "officialClose";
  const validLatest = item.history.some((point) => point.date === viewCutoff)
    && (item.id === "pig" || item.latestDate === MARKET_CUTOFF);
  if (!validStatus || !validLatest) {
    return {
      item, points: [], startDate: null, endDate: null, startValue: null, endValue: null,
      intervalReturn: null, high: null, low: null, trend: "insufficient", trendReturn: null,
      warning: `数据滞后或不是正式收盘；最新有效数据：${item.latestDate}。`,
    };
  }
  const minimumPoints = item.id === "pig"
    ? range === "1月" ? 28 : 80
    : range === "1周" ? 5 : range === "1月" ? 20 : 50;
  if (points.length < minimumPoints) {
    return {
      item, points, startDate: points[0]?.date || null, endDate: points[0]?.date || null,
      startValue: points[0]?.value ?? null, endValue: points[0]?.value ?? null,
      intervalReturn: null, high: null, low: null,
      trend: "insufficient", trendReturn: null,
      warning: `历史数据不足：当前仅有 ${points.length} 个真实观察点，暂无法可靠计算区间涨跌及最高/最低。`,
    };
  }
  const start = points[0];
  const end = points[points.length - 1];
  const high = points.reduce((best, point) => point.value > best.value ? point : best, points[0]);
  const low = points.reduce((best, point) => point.value < best.value ? point : best, points[0]);
  const trendWindow = points.slice(-5);
  const trendReturn = trendWindow.length < 5 ? null : (trendWindow[trendWindow.length - 1].value / trendWindow[0].value - 1) * 100;
  return {
    item,
    points,
    startDate: start.date,
    endDate: end.date,
    startValue: start.value,
    endValue: end.value,
    intervalReturn: (end.value / start.value - 1) * 100,
    high,
    low,
    trend: trendReturn === null
      ? "insufficient"
      : trendReturn > TREND_THRESHOLD
        ? "up"
        : trendReturn < -TREND_THRESHOLD
          ? "down"
          : "flat",
    trendReturn,
    warning: null,
  };
}

function getPriceDomain(values: number[]) {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const midpoint = (rawMin + rawMax) / 2;
  const rawRange = rawMax - rawMin;
  // 全部真实价格图共用：至少保留价格中枢 3% 的跨度，避免极小波动被过度放大。
  const effectiveRange = Math.max(rawRange, Math.abs(midpoint) * 0.03, 0.001);
  const padding = effectiveRange * 0.08;
  const min = Math.max(0, midpoint - effectiveRange / 2 - padding);
  const max = midpoint + effectiveRange / 2 + padding;
  return { min, max, span: Math.max(max - min, Number.EPSILON) };
}

function PriceChart({ view, compact = false }: { view: PriceView; compact?: boolean }) {
  const [activeDate, setActiveDate] = useState(view.endDate);
  const activePoint = view.points.find((point) => point.date === activeDate) || view.points[view.points.length - 1];
  if (view.warning || view.points.length < 2) {
    return <div className={`price-chart-wrap ${compact ? "compact" : ""}`}><div className="empty-state">{view.warning || "暂无可靠数据"}</div></div>;
  }

  const width = 820;
  const height = compact ? 250 : 330;
  const left = 62;
  const right = 24;
  const top = 26;
  const bottom = 42;
  const values = view.points.map((point) => point.value);
  const { min, max, span: domainSpan } = getPriceDomain(values);
  const startTime = new Date(`${view.startDate}T00:00:00Z`).getTime();
  const endTime = new Date(`${view.endDate}T00:00:00Z`).getTime();
  const span = Math.max(endTime - startTime, 1);
  const x = (date: string) => left + ((new Date(`${date}T00:00:00Z`).getTime() - startTime) / span) * (width - left - right);
  const y = (value: number) => top + ((max - value) / domainSpan) * (height - top - bottom);
  const yTicks = [min, (min + max) / 2, max];
  const linePath = view.points.map((point, index) => `${index ? "L" : "M"}${x(point.date)},${y(point.value)}`).join(" ");
  const areaPath = `${linePath} L${x(view.endDate!)},${height - bottom} L${x(view.startDate!)},${height - bottom} Z`;
  const fullIndex = activePoint ? view.item.history.findIndex((point) => point.date === activePoint.date) : -1;
  const previousPoint = fullIndex > 0 ? view.item.history[fullIndex - 1] : null;
  const dailyChange = activePoint && previousPoint
    ? formatSigned((activePoint.value / previousPoint.value - 1) * 100, 2)
    : "首个可用观察点";
  const activeX = activePoint ? x(activePoint.date) : left;
  const activeY = activePoint ? y(activePoint.value) : top;
  const labelIndexes = [...new Set([0, Math.round((view.points.length - 1) / 3), Math.round((view.points.length - 1) * 2 / 3), view.points.length - 1])];
  const highlightedDates = new Set([view.startDate, view.endDate, view.high?.date, view.low?.date]);

  return (
    <div className={`price-chart-wrap ${compact ? "compact" : ""}`}>
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${view.item.name}真实价格走势`}>
        <defs>
          <linearGradient id={`area-${view.item.id}-${compact ? "small" : "main"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={view.item.color} stopOpacity=".22"/>
            <stop offset="100%" stopColor={view.item.color} stopOpacity=".02"/>
          </linearGradient>
        </defs>
        {yTicks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="grid-line"/><text x={left - 10} y={y(tick) + 4} textAnchor="end" className="axis-label">{view.item.id === "etf" ? tick.toFixed(3) : tick.toFixed(2)}</text></g>)}
        <path d={areaPath} fill={`url(#area-${view.item.id}-${compact ? "small" : "main"})`}/>
        <path d={linePath} fill="none" stroke={view.item.color} strokeWidth={compact ? "3" : "4"} strokeLinecap="round" strokeLinejoin="round"/>
        {view.points.filter((point) => highlightedDates.has(point.date)).map((point) => {
          const isHigh = point.date === view.high?.date;
          const isLow = point.date === view.low?.date;
          return <g key={`marker-${point.date}`}>
            <circle cx={x(point.date)} cy={y(point.value)} r={activePoint?.date === point.date ? 6 : 4} fill={view.item.color}/>
            {(isHigh || isLow) && <><rect x={x(point.date) - 22} y={y(point.value) + (isHigh ? -27 : 12)} width="44" height="18" rx="9" className="extreme-pill"/><text x={x(point.date)} y={y(point.value) + (isHigh ? -15 : 25)} textAnchor="middle" className="extreme-text">{isHigh ? "区间高点" : "区间低点"}</text></>}
          </g>;
        })}
        {view.points.map((point) => <circle className="chart-hit" key={`hit-${point.date}`} cx={x(point.date)} cy={y(point.value)} r="8" onMouseEnter={() => setActiveDate(point.date)}/>)}
        {labelIndexes.map((index) => { const point = view.points[index]; return <text key={`label-${point.date}`} x={x(point.date)} y={height - 14} textAnchor={index === 0 ? "start" : index === view.points.length - 1 ? "end" : "middle"} className="axis-label">{shortDate(point.date)}</text>; })}
      </svg>
      {activePoint && <div className="chart-tooltip" style={{ left: `${(activeX / width) * 100}%`, top: `${(activeY / height) * 100}%` }}>
        <time>{activePoint.date}</time>
        <strong>{valueLabel(view.item, activePoint.value)}</strong>
        <span>当日涨跌：{dailyChange}</span>
      </div>}
    </div>
  );
}

function PriceStats({ view, compact = false }: { view: PriceView; compact?: boolean }) {
  const trendText = view.trend === "up" ? "近期转强" : view.trend === "down" ? "近期转弱" : view.trend === "flat" ? "近期震荡" : "历史不足";
  const stats = compact
    ? [
      { label: "起点", value: view.startValue === null ? "—" : valueLabel(view.item, view.startValue) },
      { label: "最新", value: view.endValue === null ? "—" : valueLabel(view.item, view.endValue) },
      { label: "区间涨跌", value: view.intervalReturn === null ? "—" : formatSigned(view.intervalReturn) },
    ]
    : [
      { label: "起始价格", value: view.startValue === null ? "—" : valueLabel(view.item, view.startValue) },
      { label: "最新价格", value: view.endValue === null ? "—" : valueLabel(view.item, view.endValue) },
      { label: "区间涨跌", value: view.intervalReturn === null ? "—" : formatSigned(view.intervalReturn) },
      { label: "区间最高", value: view.high ? valueLabel(view.item, view.high.value) : "—" },
      { label: "区间最低", value: view.low ? valueLabel(view.item, view.low.value) : "—" },
    ];
  return <div className={`price-stats ${compact ? "compact" : ""}`}>{stats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong className={stat.label === "区间涨跌" && (view.intervalReturn || 0) < 0 ? "negative" : stat.label === "区间涨跌" ? "positive" : ""}>{stat.value}</strong></div>)}{!compact && <div className={`trend-signal ${view.trend}`}><span>近5个交易日{view.trendReturn === null ? "" : ` ${formatSigned(view.trendReturn)}`}</span><strong>{trendText}</strong></div>}</div>;
}

function RelativeStrength({ comparison }: { comparison: ComparisonResult }) {
  const rows = comparison.items
    .filter((item) => item.id !== "pig")
    .sort((a, b) => b.relativeToPig - a.relativeToPig);
  const scale = Math.max(...rows.map((item) => Math.abs(item.relativeToPig)), 1);
  return <div className="relative-list">{rows.map((item, index) => {
    const lagging = item.relativeToPig < 0;
    return <article key={item.id}>
      <span className="rank">{String(index + 1).padStart(2, "0")}</span>
      <div className="relative-asset"><i style={{ background: item.color }}/><span><strong>{item.name}</strong><small>{item.code}</small></span></div>
      <div className="relative-value"><span>标的区间</span><strong className={item.intervalReturn >= 0 ? "positive" : "negative"}>{formatSigned(item.intervalReturn)}</strong></div>
      <div className="relative-value"><span>同期猪价</span><strong className={item.pigIntervalReturn >= 0 ? "positive" : "negative"}>{formatSigned(item.pigIntervalReturn)}</strong></div>
      <div className="relative-bar-cell"><div className="relative-bar-track"><i className={lagging ? "lagging" : "leading"} style={{ width: `${Math.max(Math.abs(item.relativeToPig) / scale * 100, 6)}%` }}/></div><strong className={lagging ? "negative" : "positive"}>{formatSigned(item.relativeToPig, 1, "pct")}</strong></div>
      <p>{item.name}：同期{lagging ? "落后" : "跑赢"}猪价 {Math.abs(item.relativeToPig).toFixed(1)} 个百分点</p>
    </article>;
  })}</div>;
}

export default function Home() {
  const securities = series.filter((item) => item.id !== "pig");
  const pigSeries = series.find((item) => item.id === "pig")!;
  const [selectedSecurityId, setSelectedSecurityId] = useState("muyuan");
  const [mainRange, setMainRange] = useState("3月");
  const [pigRange, setPigRange] = useState("3月");
  const [kind, setKind] = useState("全部");
  const [query, setQuery] = useState("");

  const selectedSecurity = securities.find((item) => item.id === selectedSecurityId) || securities[0];
  const mainView = useMemo(() => buildPriceView(selectedSecurity, mainRange), [selectedSecurity, mainRange]);
  const pigView = useMemo(() => buildPriceView(pigSeries, pigRange), [pigSeries, pigRange]);
  const comparison = useMemo(() => buildComparison(mainRange), [mainRange]);
  const threeMonthComparison = useMemo(() => buildComparison("3月"), []);
  const comparableAssets = comparison.items.filter((item) => item.id !== "pig");
  const allComparableAssetsLagPig = comparableAssets.length > 0 && comparableAssets.every((item) => item.relativeToPig <= 0);
  const visible = securities.filter((item) => (kind === "全部" || item.kind === kind) && `${item.name}${item.code}`.toLowerCase().includes(query.toLowerCase()));
  const threeMonthAssets = threeMonthComparison.items.filter((item) => item.id !== "pig");
  const strongest = [...threeMonthAssets].sort((a, b) => b.relativeToPig - a.relativeToPig)[0];
  const cycleSignals = deriveCycleSignals({
    profit: dashboardData.profit.value,
    sowCount: dashboardData.sow.count,
    sowYoY: dashboardData.sow.yoy,
    pigletPrice: dashboardData.piglet.price,
    pigletWoW: dashboardData.piglet.wow,
    relativeAssets: threeMonthAssets.map((item) => ({ name: item.name, relativeToPig: item.relativeToPig })),
  });
  const toneLabel = { red: "红灯", yellow: "黄灯", green: "绿灯" } as const;
  const cycleSteps = [
    { status: "底部承压", tone: "red" },
    { status: "修复观察", tone: "yellow" },
    { status: "景气盈利", tone: "green" },
  ] as const;
  const currentStageIndex = cycleSteps.findIndex((step) => step.status === cycleSignals.cycleStage.status);
  const coreMetrics = [
    ...staticCoreMetrics.map((item) => {
      const signal = item.signal === "sow"
        ? cycleSignals.sowSignal
        : item.signal === "profit"
          ? cycleSignals.profitSignal
          : item.signal === "piglet"
            ? cycleSignals.pigletSignal
            : null;
      return signal
        ? { ...item, status: `${toneLabel[signal.tone]} · ${signal.status}`, tone: signal.tone }
        : { ...item, status: item.status!, tone: item.tone! };
    }),
    {
      label: "猪企相对猪价",
      value: strongest ? `${strongest.name} ${formatSigned(strongest.intervalReturn)}` : "暂无可靠数据",
      unit: "同期",
      delta: strongest ? `相对猪价 ${formatSigned(strongest.relativeToPig, 1, "pct")}` : "历史数据不足",
      status: `${toneLabel[cycleSignals.equitySignal.tone]} · ${cycleSignals.equitySignal.status}`,
      tone: cycleSignals.equitySignal.tone,
      date: threeMonthComparison.startDate && threeMonthComparison.endDate
        ? `${shortDate(threeMonthComparison.startDate)}—${shortDate(threeMonthComparison.endDate)}`
        : "待更新",
      source: strongest?.sourceName || "暂无可靠数据",
      url: strongest?.sourceUrl || "#",
      meaning: "与同期图表共用同一结果。相对猪价 = 标的区间涨跌幅 − 同期猪价区间涨跌幅；负数表示落后猪价。",
    },
  ];

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Icon name="pig" /></span><div><strong>猪周期观察</strong><span>PIG CYCLE OBSERVER</span></div></div>
        <div className="status">
          <span className="live-dot"/>
          <span className="status-copy">
            <strong>行情截至 {MARKET_CUTOFF.replaceAll("-", ".")} 收盘</strong>
            <small>页面更新 {PAGE_UPDATED_DATE.replaceAll("-", ".")}</small>
          </span>
        </div>
      </header>

      <section className="hero">
        <div><p className="eyebrow">MARKET OVERVIEW / 市场总览</p><h1>{cycleSignals.heroHeadline.lead}<em>{cycleSignals.heroHeadline.emphasis}</em></h1><p className="hero-copy">把猪价、仔猪、饲料、母猪产能、养殖利润与猪企股价放进同一套周期框架，优先看趋势与验证，不被单日涨跌带偏。</p></div>
        <aside className="cycle-card" aria-label={`当前周期位置：${toneLabel[cycleSignals.cycleStage.tone]}，${cycleSignals.cycleStage.status}`}>
          <div className="cycle-card-head"><span>当前周期位置</span><strong className={cycleSignals.cycleStage.tone}><i />{toneLabel[cycleSignals.cycleStage.tone]} · {cycleSignals.cycleStage.status}</strong></div>
          <ol className="cycle-steps" aria-label="周期位置图例">{cycleSteps.map((step, index) => (
            <li className={`${step.tone} ${index === currentStageIndex ? "active" : ""}`} key={step.status}>
              <span className="cycle-light"/><b>{step.status}</b>
              <small>{index === currentStageIndex ? "当前" : index < currentStageIndex ? "已通过" : "待确认"}</small>
            </li>
          ))}</ol>
          <p>{cycleSignals.cycleStage.description}</p>
          <small className="cycle-caption">颜色表示行业周期状态，不代表股票涨跌，也不是买卖信号。</small>
        </aside>
      </section>

      <section className="indicator-section" aria-labelledby="indicator-title">
        <div className="indicator-heading"><div><p className="eyebrow">BEGINNER&apos;S GUIDE / 新手读数</p><h2 id="indicator-title">先看猪价，再看成本</h2></div><p>右上角行情截至日不等于所有指标日期。玉米、豆粕和育肥猪配合饲料统一采用农业农村部全国周度监测系列；猪价及自计算猪粮比保留其独立来源与口径。</p></div>
        <div className="metric-grid">{metrics.map((metric) => <article className="metric" key={metric.label}><div className="metric-summary"><div className="metric-icon"><Icon name={metric.icon}/></div><div className="metric-value"><span>{metric.label}<i>{metric.date}</i></span><strong>{metric.value}<small>{metric.unit}</small></strong></div><b className={metric.tone}>{metric.delta}</b></div><div className={`metric-impact ${metric.impactTone}`}><span>↑ 数值升高</span><strong>{metric.impact}</strong></div><details className="metric-explain"><summary><span>口径、来源与计算</span><b aria-hidden="true">＋</b></summary><p>{metric.explanation}</p><p className="metric-scope">{metric.scope}</p><a href={metric.sourceUrl} target="_blank" rel="noreferrer">来源：{metric.source} ↗</a></details></article>)}</div>
      </section>

      <section className="core-section" aria-labelledby="core-title">
        <div className="section-heading"><div><p className="eyebrow">CYCLE DASHBOARD / 核心指标</p><h2 id="core-title">六个核心猪周期观察指标</h2></div><p>每张卡片都标明日期与来源；利润和行情不是官方统计时，会明确写“样本”“公开行情”或“自计算”。</p></div>
        <div className="core-grid">{coreMetrics.map((item) => <article className="core-card" key={item.label}><div className="core-card-top"><span>{item.label}</span><b className={item.tone}><i/>{item.status}</b></div><strong className="core-value">{item.value}<small>{item.unit}</small></strong><div className="core-meta"><span>{item.delta}</span><span>{item.date}</span></div><p><b>数值升高意味着：</b>{item.meaning}</p><a href={item.url} target="_blank" rel="noreferrer">来源：{item.source} ↗</a></article>)}</div>
      </section>

      <section className="workspace">
        <aside className="filters">
          <div className="aside-title"><div><p className="eyebrow">SECURITY VIEW</p><h2>查看标的</h2></div><span>单选</span></div>
          <label className="search"><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名称或代码"/></label>
          <div className="kind-tabs">{["全部", "公司", "ETF"].map((value) => <button key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{value}</button>)}</div>
          <div className="asset-list">{visible.map((item) => <button className={`asset-option ${selectedSecurityId === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedSecurityId(item.id)}><span className="radio-dot"/><i style={{ background: item.color }}/><span><strong>{item.name}</strong><small>{item.code} · {item.kind}</small></span></button>)}</div>
          <div className="data-health"><div><span>当前区间</span><strong>{mainView.startDate ? `${shortDate(mainView.startDate)}—${shortDate(mainView.endDate)}` : "历史数据不足"}</strong></div><div className="health-track"><i/></div><p>一次只看一只股票或 ETF。当前区间读取 {mainView.points.length} 个真实交易日收盘点；ETF NAV 不参与主图与涨跌计算。</p></div>
        </aside>

        <div className="content">
          <article className="panel security-panel">
            <div className="panel-head security-head"><div><p className="eyebrow">SINGLE SECURITY / 单标的走势</p><h2><i style={{ background: selectedSecurity.color }}/>{selectedSecurity.name}<small>{selectedSecurity.code}</small></h2><span>纵轴为真实交易价格 · {selectedSecurity.kind === "ETF" ? "交易所正式收盘价" : "股票正式收盘价"}</span></div><div className="range-tabs"><Icon name="calendar"/>{["1周", "1月", "3月"].map((value) => <button key={value} onClick={() => setMainRange(value)} className={mainRange === value ? "active" : ""}>{value}</button>)}</div></div>
            <div className="security-context"><span><b>行情共同截止</b>{MARKET_CUTOFF} 收盘</span><span><b>实际区间</b>{mainView.startDate || "—"} ～ {mainView.endDate || "—"}</span><span><b>真实收盘点</b>{mainView.points.length} 个交易日</span><span className={`direction ${mainView.intervalReturn !== null && mainView.intervalReturn >= 0 ? "positive" : "negative"}`}><b>这段时间</b>{mainView.intervalReturn === null ? "历史数据不足" : mainView.intervalReturn >= 0 ? `上涨 ${Math.abs(mainView.intervalReturn).toFixed(1)}%` : `下跌 ${Math.abs(mainView.intervalReturn).toFixed(1)}%`}</span></div>
            {mainView.warning && <p className="data-warning">{mainView.warning}</p>}
            <PriceStats view={mainView}/>
            <PriceChart key={`${selectedSecurity.id}-${mainRange}`} view={mainView}/>
            {selectedSecurity.nav && <p className="nav-helper">辅助信息：单位净值 NAV {selectedSecurity.nav.value.toFixed(4)}（{selectedSecurity.nav.date}）。NAV 不参与本图和涨跌幅计算。</p>}
            <p className="chart-note">纵轴按当前区间真实价格动态缩放，并保留真实价格刻度；曲线使用全部正式收盘点，只突出起点、最新点与区间高低点。悬停曲线可查看每个交易日的真实收盘价及相对上一交易日涨跌。</p>
          </article>

          <article className="panel pig-trend-panel">
            <div className="panel-head"><div><p className="eyebrow">PIG PRICE TREND / 猪价走势</p><h2>全国外三元猪价</h2><span>单独观察猪价本身是上涨、下跌还是震荡 · 单位：元/公斤</span></div><div className="range-tabs"><Icon name="calendar"/>{["1月", "3月"].map((value) => <button key={value} onClick={() => setPigRange(value)} className={pigRange === value ? "active" : ""}>{value}</button>)}</div></div>
            <div className="security-context"><span><b>数据频率</b>日频真实观察</span><span><b>实际区间</b>{pigView.startDate || "—"} ～ {pigView.endDate || "—"}</span><span><b>真实观察点</b>{pigView.points.length} 个自然日</span></div>
            <PriceStats view={pigView} compact/>
            <PriceChart key={`pig-${pigRange}`} view={pigView} compact/>
            <p className="chart-note">来源：中国养猪网全国外三元公开日频序列。只连接真实观察点，不插值、不补点；区间高低点从所选范围全部真实观察值中计算。</p>
          </article>

          <article className="panel relative-panel">
            <div className="panel-head"><div><p className="eyebrow">RELATIVE TO PIG PRICE / 相对猪价</p><h2>谁相对猪价更强，谁更弱</h2><span>{allComparableAssetsLagPig ? "当前所有观察标的均跑输同期猪价；排名表示谁落后得更少，并不代表跑赢猪价。" : "排名表示相对同期猪价的领先或滞后程度。"}</span></div><span className="muted">共同区间 {comparison.startDate || "—"} ～ {comparison.endDate || "—"}</span></div>
            {comparison.warning && <p className="data-warning">{comparison.warning}</p>}
            <div className="relative-columns"><span>排名 / 标的</span><span>标的区间</span><span>同期猪价</span><span>相对猪价</span></div>
            <RelativeStrength comparison={comparison}/>
            <p className="chart-note">相对猪价 = 标的区间涨跌幅 − 同期猪价区间涨跌幅。该指标用于观察股票价格相对产业价格的领先或滞后，不代表股票估值高低，也不是买卖信号。所有标的继续使用共同起止日和 V1 已修正的数据质量规则。</p>
          </article>

          <article className="panel event-panel">
            <div className="panel-head"><div><p className="eyebrow">TURNING POINTS & EVENTS</p><h2>拐点、政策与财报事件</h2></div><span className="muted">含当日财报日历</span></div>
            <div className="event-timeline">{timelineEvents.map((event) => <article key={`${event.date}-${event.title}`}><time>{event.date}</time><i className={event.tone}/><div><span className={`event-type ${event.tone}`}>{event.type}</span><strong>{event.title}</strong><p>{event.note}</p></div></article>)}</div>
          </article>
        </div>
      </section>

      <section className="signal-section">
        <div className="signal-intro"><p className="eyebrow">CYCLE SIGNALS</p><h2>四个问题，判断周期走到哪里</h2><p>价格是结果。供给退出、成本变化、利润修复与市场预期是否共振，才是周期反转的验证链。</p></div>
        <div className="signal-grid">
          <article>
            <span>01</span><h3>养殖利润是否转正？</h3>
            <strong className={cycleSignals.profitSignal.tone}>{cycleSignals.profitSignal.valueText}</strong>
            <p>{cycleSignals.profitSignal.status}：{cycleSignals.profitSignal.description}</p>
          </article>
          <article>
            <span>02</span><h3>母猪产能是否去化？</h3>
            <strong className={cycleSignals.sowSignal.tone}>{cycleSignals.sowSignal.valueText}</strong>
            <p>{cycleSignals.sowSignal.status}：{cycleSignals.sowSignal.description}</p>
          </article>
          <article>
            <span>03</span><h3>仔猪是否率先转强？</h3>
            <strong className={cycleSignals.pigletSignal.tone}>{cycleSignals.pigletSignal.status}</strong>
            <p>{cycleSignals.pigletSignal.valueText}。{cycleSignals.pigletSignal.description}</p>
          </article>
          <article>
            <span>04</span><h3>股价是否抢跑猪价？</h3>
            <strong className={cycleSignals.equitySignal.tone}>{cycleSignals.equitySignal.status}</strong>
            <p>{cycleSignals.equitySignal.description}</p>
          </article>
        </div>
      </section>

      <footer><div><strong>猪周期观察</strong><span>只做观察，不做预测。</span></div><p>页面更新日 {PAGE_UPDATED_DATE}，不等于所有产业指标的数据日期。证券行情截至 {MARKET_CUTOFF} 正式收盘；159867 主行情使用交易所收盘价，NAV 仅作辅助。玉米、豆粕、育肥猪配合饲料采用农业农村部 2026 年 8 月第 1 周全国监测系列；全国外三元为公开报价样本。猪粮比按同一来源页的猪价与独立现货口径玉米报价自计算，所用玉米序列不同于首页农业农村部全国监测均价，也不是官方猪粮比。数据更新失败或历史不足时不补点、不伪装为最新数据；仅供个人研究，不构成投资建议。</p></footer>
    </main>
  );
}
