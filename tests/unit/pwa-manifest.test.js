import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../src/app/manifest.js";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("PWA manifest icons", () => {
  it("uses available PNG icons for Chromium installation", () => {
    const icons = manifest().icons;
    const iconPaths = icons.map((icon) => icon.src);

    expect(iconPaths).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-512.png",
    ]);
    expect(icons[0]).toMatchObject({ sizes: "192x192", type: "image/png" });
    expect(icons[1]).toMatchObject({ sizes: "512x512", type: "image/png" });
    expect(icons[2]).toMatchObject({
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    });

    for (const iconPath of new Set(iconPaths)) {
      const filePath = new URL(`../../public${iconPath}`, import.meta.url);
      expect(readFileSync(filePath).subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
    }
  });
});
