import assert from "node:assert/strict";
import { test } from "node:test";
import type { PluginButtonIconProps } from "@getpaseo/plugin/client";
import { createLightningIcon } from "../client/lightning";

test("lightning preserves the native Zap icon and size, overriding only its color", () => {
  const HostIcon = () => null;
  const LightningIcon = createLightningIcon(HostIcon);
  for (const color of ["#ffffff", "#111111"]) {
    const element = LightningIcon({ size: 14, color } as PluginButtonIconProps);
    assert.equal(element.type, HostIcon);
    assert.deepEqual(element.props, { name: "Zap", size: 14, color: "#eab308" });
  }
});
