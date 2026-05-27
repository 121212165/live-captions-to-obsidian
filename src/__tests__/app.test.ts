import { describe, it, expect } from "vitest";
import { Application } from "../app.js";
import { defaultConfig } from "../config.js";

describe("Application", () => {
  it("can be constructed with valid config", () => {
    expect(() => new Application(defaultConfig)).not.toThrow();
  });

  it("stop resolves without error when not started", async () => {
    const app = new Application(defaultConfig);
    await expect(app.stop()).resolves.toBeUndefined();
  });
});
