import { describe, expect, test } from "vitest";
import { dashboardData, series } from "./dashboardData";
import { historyById } from "./marketHistory";

const SECURITY_IDS = ["muyuan", "wens", "newhope", "shennong", "etf"] as const;

describe("market dashboard derivation", () => {
  test("derives latest fields and cutoff from the history source of truth", () => {
    for (const id of SECURITY_IDS) {
      const history = historyById[id];
      const latest = history.at(-1)!;
      const previous = history.at(-2)!;
      const item = series.find((candidate) => candidate.id === id)!;

      expect(item.latest).toBe(latest.value);
      expect(item.latestDate).toBe(latest.date);
      expect(item.change).toBeCloseTo((latest.value / previous.value - 1) * 100);
      expect(item.latestDate).toBe(dashboardData.market.cutoff);
    }
  });
});
