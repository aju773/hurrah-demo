import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import ArtworkPreview from "./ArtworkPreview";

afterEach(cleanup);

// A landscape 210x148 file as the server describes it once Rotate has turned it
// onto the portrait A5 Size: geometry already swapped, the raster flagged rotation 90.
const rotated = { image_url: "/f.png", file_trim_mm: [148, 210], file_bleed_mm: 3, rotation: 90, transform: null };
const plain = { image_url: "/f.png", file_trim_mm: [148, 210], file_bleed_mm: 3, rotation: 0, transform: null };

function draw(image) {
  return render(<ArtworkPreview slot="front" image={image} orderedTrimMm={[148, 210]} productBleedMm={3} productSafeMm={5} groups={[]} withGuides={false} />).container.querySelector("image");
}

describe("ArtworkPreview and Rotate", () => {
  it("draws an unturned page as it is", () => {
    const image = draw(plain);
    expect(image).not.toHaveAttribute("transform");
    expect(image).toHaveAttribute("width", "154");
    expect(image).toHaveAttribute("height", "216");
  });

  it("turns the page image a quarter turn about the middle of the page, drawn at the raster's own shape", () => {
    const image = draw(rotated);
    // The raster is the unturned 216 x 154 page box; turned, it fills the 154 x 216 box at (-3,-3).
    expect(image).toHaveAttribute("width", "216");
    expect(image).toHaveAttribute("height", "154");
    expect(image).toHaveAttribute("x", String(74 - 108));
    expect(image).toHaveAttribute("y", String(105 - 77));
    expect(image).toHaveAttribute("transform", "rotate(90 74 105)");
  });
});
