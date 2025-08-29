import { describe, expect, test } from "@jest/globals";
import { COLOR_INSERT, COLOR_DELETE, COLOR_CHANGE, isValidMusicXMLColor } from "@/utils/musicxmldiff-config";

describe("MusicXML diff colors", () => {
  test("all predefined colors are valid MusicXML colors", () => {
    expect(isValidMusicXMLColor(COLOR_INSERT)).toBe(true);
    expect(isValidMusicXMLColor(COLOR_DELETE)).toBe(true);
    expect(isValidMusicXMLColor(COLOR_CHANGE)).toBe(true);
  });

  test("predefined colors have correct values", () => {
    expect(COLOR_INSERT).toBe("#00FF00");
    expect(COLOR_DELETE).toBe("#FF0000");
    expect(COLOR_CHANGE).toBe("#FFFF00");
  });

  test("validator accepts valid colors", () => {
    const validColors = ["#123456", "#abcdef", "#ABCDEF", "#000000", "#FFFFFF"];
    validColors.forEach((color) => {
      expect(isValidMusicXMLColor(color)).toBe(true);
    });
  });

  test("validator rejects invalid colors", () => {
    const invalidColors = ["123456", "#12345", "#1234567", "#ZZZZZZ", "#FFF", "red", ""];
    invalidColors.forEach((color) => {
      expect(isValidMusicXMLColor(color)).toBe(false);
    });
  });
});
