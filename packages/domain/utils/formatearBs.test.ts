import { expect, test } from "vitest";
import { formatearBs } from "./formatearBs";

test("usa coma decimal y siempre dos decimales", () => {
  expect(formatearBs(850)).toBe("850,00");
});

test("agrupa los miles con punto", () => {
  expect(formatearBs(12345.6)).toBe("12.345,60");
});
