import { describe, expect, it } from "vitest";
import { deriveCycleSignals, type CycleSignalInput } from "./cycleSignals";

const baseInput: CycleSignalInput = {
  profit: -190.25,
  sowCount: 3780,
  sowYoY: -6.5,
  pigletPrice: 22.42,
  pigletWoW: -2.5,
  relativeAssets: [
    { name: "牧原股份", relativeToPig: -5 },
    { name: "神农集团", relativeToPig: -2 },
    { name: "畜牧ETF", relativeToPig: 0 },
  ],
};

describe("deriveCycleSignals", () => {
  it("Case 1: derives the current bottom-pressure state from negative inputs", () => {
    const result = deriveCycleSignals(baseInput);

    expect(result.profitSignal.status).toBe("仍在亏损");
    expect(result.profitSignal.valueText).toBe("-190 元/头");
    expect(result.sowSignal.status).toBe("产能去化");
    expect(result.pigletSignal.status).toBe("仔猪偏弱");
    expect(result.equitySignal.status).toBe("整体滞后");
    expect(result.cycleStage.status).toBe("底部承压");
    expect(result.heroHeadline.full).toBe("利润仍在水下，产能开始去化。");
  });

  it("Case 2: enters repair observation when piglets strengthen before profit", () => {
    const result = deriveCycleSignals({
      ...baseInput,
      pigletWoW: 1.2,
      relativeAssets: [
        { name: "牧原股份", relativeToPig: 2 },
        { name: "神农集团", relativeToPig: -1 },
        { name: "畜牧ETF", relativeToPig: -3 },
      ],
    });

    expect(result.pigletSignal.status).toBe("仔猪转强");
    expect(result.equitySignal.status).toBe("个股分化");
    expect(result.cycleStage.status).toBe("修复观察");
  });

  it("Case 3: removes loss wording and reaches prosperity after full confirmation", () => {
    const result = deriveCycleSignals({
      ...baseInput,
      profit: 120,
      pigletWoW: 0.2,
      relativeAssets: [
        { name: "牧原股份", relativeToPig: 3 },
        { name: "神农集团", relativeToPig: 2 },
        { name: "畜牧ETF", relativeToPig: -1 },
      ],
    });

    expect(result.profitSignal.status).toBe("利润转正");
    expect(JSON.stringify(result)).not.toContain("仍在亏损");
    expect(result.heroHeadline.full).toBe("利润开始修复，产能仍在去化。");
    expect(result.cycleStage.status).toBe("景气盈利");
  });

  it("Case 4: switches capacity and headline wording when sows expand", () => {
    const result = deriveCycleSignals({ ...baseInput, sowYoY: 2.1 });

    expect(result.sowSignal.status).toBe("产能扩张");
    expect(JSON.stringify(result)).not.toContain("产能去化");
    expect(result.heroHeadline.full).toBe("利润仍承压，产能却在扩张。");
  });

  it("Case 5: detects unanimous outperformance and dynamically ranks strongest", () => {
    const result = deriveCycleSignals({
      ...baseInput,
      relativeAssets: [
        { name: "牧原股份", relativeToPig: 1 },
        { name: "神农集团", relativeToPig: 5 },
        { name: "畜牧ETF", relativeToPig: 2 },
      ],
    });

    expect(result.equitySignal.status).toBe("一致抢跑");
    expect(result.equitySignal.strongest?.name).toBe("神农集团");
    expect(result.equitySignal.description).toContain("当前相对最强：神农集团");
    expect(result.equitySignal.outperformCount).toBe(3);
  });

  it("treats sow changes within ±0.5% as neutral", () => {
    expect(deriveCycleSignals({ ...baseInput, sowYoY: 0.5 }).sowSignal.status).toBe("产能平稳");
    expect(deriveCycleSignals({ ...baseInput, sowYoY: -0.5 }).sowSignal.status).toBe("产能平稳");
  });
});
