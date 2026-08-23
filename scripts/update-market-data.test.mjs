import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { MARKET_INSTRUMENTS, updateMarketData } from "./update-market-data.mjs";

const temporaryDirectories = [];
const TEST_NOW = new Date("2026-08-24T10:30:00Z");

function fixtureSource() {
  const arrays = MARKET_INSTRUMENTS.map(({ id }, index) => `  ${id}: [
    { date: "2026-08-20", value: ${10 + index} },
    { date: "2026-08-21", value: ${11 + index} },
  ],`).join("\n");
  return `export const historyById = {\n${arrays}\n};\n`;
}

async function createFixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "market-update-test-"));
  temporaryDirectories.push(directory);
  const historyFile = path.join(directory, "marketHistory.ts");
  await writeFile(historyFile, fixtureSource(), "utf8");
  return historyFile;
}

function allSeriesWith(date) {
  return async (instrument) => [{
    date,
    close: instrument.id === "etf" ? 0.542 : 20 + MARKET_INSTRUMENTS.indexOf(instrument),
  }];
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe("updateMarketData", () => {
  test("exits normally on a weekend without calling the source", async () => {
    const historyFile = await createFixture();
    const before = await readFile(historyFile, "utf8");

    const result = await updateMarketData({
      historyFile,
      now: new Date("2026-08-23T10:30:00Z"),
      fetchSeries: async () => { throw new Error("source should not be called"); },
    });

    expect(result.changed).toBe(false);
    expect(await readFile(historyFile, "utf8")).toBe(before);
  });

  test("does not write when the source has no newer completed trading day", async () => {
    const historyFile = await createFixture();
    const before = await readFile(historyFile, "utf8");

    const result = await updateMarketData({
      historyFile,
      now: TEST_NOW,
      fetchSeries: async () => [{ date: "2026-08-21", close: 99 }],
    });

    expect(result.changed).toBe(false);
    expect(await readFile(historyFile, "utf8")).toBe(before);
  });

  test("appends a synchronized date exactly once across repeated runs", async () => {
    const historyFile = await createFixture();
    const fetchSeries = allSeriesWith("2026-08-24");

    const first = await updateMarketData({ historyFile, now: TEST_NOW, fetchSeries });
    const afterFirst = await readFile(historyFile, "utf8");
    const second = await updateMarketData({ historyFile, now: TEST_NOW, fetchSeries });
    const afterSecond = await readFile(historyFile, "utf8");

    expect(first).toMatchObject({ changed: true, addedDates: ["2026-08-24"] });
    expect(second.changed).toBe(false);
    expect(afterSecond).toBe(afterFirst);
    expect(afterSecond.match(/date: "2026-08-24"/g)).toHaveLength(5);
    expect(afterSecond).toContain('{ date: "2026-08-21", value: 11 },');
  });

  test("rejects mismatched source dates without writing any partial data", async () => {
    const historyFile = await createFixture();
    const before = await readFile(historyFile, "utf8");

    await expect(updateMarketData({
      historyFile,
      now: new Date("2026-08-25T10:30:00Z"),
      fetchSeries: async (instrument) => [{
        date: instrument.id === "etf" ? "2026-08-25" : "2026-08-24",
        close: 20,
      }],
    })).rejects.toThrow("Source dates are not synchronized");

    expect(await readFile(historyFile, "utf8")).toBe(before);
  });
});
