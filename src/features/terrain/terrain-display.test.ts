import { expect, it } from "vitest";
import { displayPosition } from "./terrain-display";
import { fromScene } from "./spatial";

const grid = {
  width: 2,
  height: 2,
  westM: 0,
  northM: 4,
  cellSizeM: 4,
  values: new Float32Array([10, 20, 30, 60]),
};
it("follows the actual triangle under a route point and scales only its height", () => {
  const point = { x: 1, y: 3 };
  const displayed = displayPosition(point, grid, 10, 3)!;
  expect(displayed).toEqual([-1, 22.5, -1]);
  expect(fromScene(displayed[0], displayed[2], grid)).toEqual(point);
  expect(displayPosition(point, grid, 10, 3, 4)?.[1]).toBe(26.5);
  expect(displayPosition({ x: -1, y: 3 }, grid, 10, 3)).toBeNull();
  expect(
    displayPosition(
      point,
      { ...grid, values: new Float32Array([NaN, 20, 30, 60]) },
      10,
      3,
    ),
  ).toBeNull();
});
