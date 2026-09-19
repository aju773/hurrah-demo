import { describe, expect, it } from "vitest";
import { FILL, FIT, computeSizeChoice, scaleNote } from "./sizeChoice";

describe("computeSizeChoice", () => {
  it("Layla: A4 file (210x297) fit inside an A5 order (148x210)", () => {
    const result = computeSizeChoice(FIT, [148, 210], [210, 297], 0, 3);
    expect(result.scalePct).toBeCloseTo(70.5, 1);
    expect(result.whiteBorderMm).toBeLessThan(1);
    expect(result.edges).toEqual(["top", "bottom"]);
  });

  it("a 200x200mm no-match file against an A5 order: fit", () => {
    const result = computeSizeChoice(FIT, [148, 210], [200, 200], 0, 3);
    expect(result.scalePct).toBeCloseTo(74.0, 1);
    expect(result.whiteBorderMm).toBeCloseTo(31.0, 0);
    expect(result.edges).toEqual(["top", "bottom"]);
  });

  it("a 200x200mm no-match file against an A5 order: fill", () => {
    const result = computeSizeChoice(FILL, [148, 210], [200, 200], 0, 3);
    expect(result.scalePct).toBeCloseTo(108.0, 1);
    expect(result.cropMm).toBeCloseTo(34.0, 0);
    expect(result.edges).toEqual(["left", "right"]);
  });

  it("scale of exactly 1 reports no border and null edges", () => {
    const result = computeSizeChoice(FIT, [148, 210], [148, 210], 0, 3);
    expect(result.scalePct).toBe(100);
    expect(result.whiteBorderMm).toBe(0);
    expect(result.edges).toBeNull();
  });

  it("swaps the ordered dimensions to the file's orientation", () => {
    const portrait = computeSizeChoice(FIT, [148, 210], [148, 210], 0, 3);
    const landscapeFile = computeSizeChoice(FIT, [148, 210], [210, 148], 0, 3);
    expect(landscapeFile.scalePct).toBe(portrait.scalePct);
  });

  it("throws on an unknown mode", () => {
    expect(() => computeSizeChoice("stretch", [148, 210], [148, 210], 0, 3)).toThrow();
  });
});

describe("scaleNote", () => {
  it("describes a shrink with a border", () => {
    const note = scaleNote({ mode: FIT, scalePct: 74, whiteBorderMm: 31, edges: ["top", "bottom"] });
    expect(note).toBe("Shrunk to 74%. White border 31.0mm on top & bottom.");
  });

  it("describes a fill with a crop", () => {
    const note = scaleNote({ mode: FILL, scalePct: 108, cropMm: 34, edges: ["left", "right"] });
    expect(note).toBe("Scaled to 108%. 34.0mm cut off left & right — check nothing important is lost.");
  });
});
