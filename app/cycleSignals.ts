export type SignalTone = "red" | "yellow" | "green";
export type RelativeAsset = { name: string; relativeToPig: number };
export type CycleSignalInput = {
  profit: number;
  sowCount: number;
  sowYoY: number;
  pigletPrice: number;
  pigletWoW: number;
  relativeAssets: RelativeAsset[];
};

type BaseSignal<TStatus extends string> = {
  status: TStatus;
  tone: SignalTone;
  description: string;
};

export type CycleSignals = {
  profitSignal: BaseSignal<"仍在亏损" | "利润转正"> & { valueText: string; isProfitable: boolean };
  sowSignal: BaseSignal<"产能去化" | "产能平稳" | "产能扩张"> & { valueText: string; direction: "reducing" | "stable" | "expanding" };
  pigletSignal: BaseSignal<"仔猪转强" | "仔猪整理" | "仔猪偏弱"> & { valueText: string; direction: "strong" | "stable" | "weak" };
  equitySignal: BaseSignal<"一致抢跑" | "多数转强" | "个股分化" | "整体滞后" | "暂无比较"> & {
    outperformCount: number;
    totalComparableCount: number;
    strongest: RelativeAsset | null;
  };
  cycleStage: BaseSignal<"底部承压" | "修复观察" | "景气盈利">;
  heroHeadline: { lead: string; emphasis: string; full: string };
};

const SOW_NEUTRAL_THRESHOLD = 0.5;

function formatSignedPercent(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function deriveProfitSignal(profit: number): CycleSignals["profitSignal"] {
  const valueText = `${Math.round(profit).toLocaleString("zh-CN")} 元/头`;
  return profit < 0
    ? { status: "仍在亏损", tone: "red", valueText, isProfitable: false, description: "当前养殖利润仍为负，行业仍承受成本压力。" }
    : { status: "利润转正", tone: "green", valueText, isProfitable: true, description: "养殖利润已经转正，行业现金流和盈利环境开始改善。" };
}

function deriveSowSignal(sowCount: number, sowYoY: number): CycleSignals["sowSignal"] {
  const valueText = `${sowCount.toLocaleString("zh-CN")} 万头（同比 ${formatSignedPercent(sowYoY)}）`;
  if (sowYoY < -SOW_NEUTRAL_THRESHOLD) {
    return { status: "产能去化", tone: "green", direction: "reducing", valueText, description: "能繁母猪同比下降，供给端正在收缩。" };
  }
  if (sowYoY > SOW_NEUTRAL_THRESHOLD) {
    return { status: "产能扩张", tone: "red", direction: "expanding", valueText, description: "能繁母猪同比上升，未来供给压力可能重新增加。" };
  }
  return { status: "产能平稳", tone: "yellow", direction: "stable", valueText, description: "能繁母猪同比变化处于 ±0.5% 中性区间，供给端暂时平稳。" };
}

function derivePigletSignal(pigletPrice: number, pigletWoW: number): CycleSignals["pigletSignal"] {
  const valueText = `${pigletPrice.toFixed(2)} 元/公斤（环比 ${formatSignedPercent(pigletWoW)}）`;
  const ruleNote = "当前仅基于最新一期环比变化判断；后续接入仔猪历史序列后再升级趋势规则。";
  if (pigletWoW >= 1) {
    return { status: "仔猪转强", tone: "green", direction: "strong", valueText, description: `最新一期仔猪价格环比上涨，补栏预期有所转强。${ruleNote}` };
  }
  if (pigletWoW <= -1) {
    return { status: "仔猪偏弱", tone: "red", direction: "weak", valueText, description: `最新一期仔猪价格环比下降，补栏预期仍偏弱。${ruleNote}` };
  }
  return { status: "仔猪整理", tone: "yellow", direction: "stable", valueText, description: `最新一期仔猪价格环比变化有限，暂处整理。${ruleNote}` };
}

function deriveEquitySignal(relativeAssets: RelativeAsset[]): CycleSignals["equitySignal"] {
  const ranked = [...relativeAssets].sort((a, b) => b.relativeToPig - a.relativeToPig);
  const strongest = ranked[0] ?? null;
  const totalComparableCount = ranked.length;
  const outperformCount = ranked.filter((asset) => asset.relativeToPig > 0).length;
  const strongestText = strongest ? `当前相对最强：${strongest.name}。` : "";
  if (totalComparableCount === 0) {
    return { status: "暂无比较", tone: "yellow", outperformCount, totalComparableCount, strongest, description: "当前没有足够的共同区间数据，暂不判断证券是否抢跑猪价。" };
  }
  if (outperformCount === totalComparableCount) {
    return { status: "一致抢跑", tone: "green", outperformCount, totalComparableCount, strongest, description: `当前观察标的均跑赢同期猪价，资本市场整体领先产业价格。${strongestText}` };
  }
  if (outperformCount > totalComparableCount / 2) {
    return { status: "多数转强", tone: "green", outperformCount, totalComparableCount, strongest, description: `多数观察标的已经跑赢同期猪价，市场预期有所改善。${strongestText}` };
  }
  if (outperformCount > 0) {
    return { status: "个股分化", tone: "yellow", outperformCount, totalComparableCount, strongest, description: `仅部分标的跑赢同期猪价，板块尚未形成一致趋势。${strongestText}` };
  }
  return { status: "整体滞后", tone: "red", outperformCount, totalComparableCount, strongest, description: `当前所有观察标的均落后同期猪价，资本市场尚未形成一致抢跑。${strongestText}` };
}

function deriveHeroHeadline(profitable: boolean, sowDirection: CycleSignals["sowSignal"]["direction"]): CycleSignals["heroHeadline"] {
  if (!profitable && sowDirection === "reducing") return { lead: "利润仍在水下，", emphasis: "产能开始去化。", full: "利润仍在水下，产能开始去化。" };
  if (!profitable && sowDirection === "expanding") return { lead: "利润仍承压，", emphasis: "产能却在扩张。", full: "利润仍承压，产能却在扩张。" };
  if (!profitable) return { lead: "利润仍承压，", emphasis: "产能保持平稳。", full: "利润仍承压，产能保持平稳。" };
  if (sowDirection === "reducing") return { lead: "利润开始修复，", emphasis: "产能仍在去化。", full: "利润开始修复，产能仍在去化。" };
  if (sowDirection === "expanding") return { lead: "利润已经改善，", emphasis: "产能重新扩张。", full: "利润已经改善，产能重新扩张。" };
  return { lead: "利润已经改善，", emphasis: "产能保持平稳。", full: "利润已经改善，产能保持平稳。" };
}

export function deriveCycleSignals(input: CycleSignalInput): CycleSignals {
  const profitSignal = deriveProfitSignal(input.profit);
  const sowSignal = deriveSowSignal(input.sowCount, input.sowYoY);
  const pigletSignal = derivePigletSignal(input.pigletPrice, input.pigletWoW);
  const equitySignal = deriveEquitySignal(input.relativeAssets);
  const marketConfirmed = equitySignal.status === "一致抢跑" || equitySignal.status === "多数转强";

  let cycleStage: CycleSignals["cycleStage"];
  if (!profitSignal.isProfitable && pigletSignal.direction !== "strong") {
    cycleStage = { status: "底部承压", tone: "red", description: `${profitSignal.description}${sowSignal.direction === "reducing" ? "母猪产能去化是底部阶段的积极变化，但仍需等待仔猪和利润确认。" : "供给与需求端仍需继续观察。"}` };
  } else if (profitSignal.isProfitable && pigletSignal.direction !== "weak" && sowSignal.direction !== "expanding" && marketConfirmed) {
    cycleStage = { status: "景气盈利", tone: "green", description: "利润已经转正，仔猪未走弱、产能没有扩张压力，且多数观察标的跑赢猪价，产业与市场形成确认。" };
  } else {
    cycleStage = { status: "修复观察", tone: "yellow", description: profitSignal.isProfitable ? "利润已经转正，但仔猪、产能或资本市场仍至少有一项尚未确认。" : "利润仍为负，但母猪去化与仔猪转强显示周期正在进入修复观察。" };
  }

  return {
    profitSignal,
    sowSignal,
    pigletSignal,
    equitySignal,
    cycleStage,
    heroHeadline: deriveHeroHeadline(profitSignal.isProfitable, sowSignal.direction),
  };
}
