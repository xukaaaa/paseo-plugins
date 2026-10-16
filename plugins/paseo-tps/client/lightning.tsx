import type { ComponentType } from "react";
import type { PluginButtonIconProps, PluginIconProps } from "@getpaseo/plugin/client";

/** Keep Paseo's Zap shape and sizing; override only the lightning color. */
export function createLightningIcon(Icon: ComponentType<PluginIconProps>) {
  return function YellowLightningIcon({ size }: PluginButtonIconProps) {
    return <Icon name="Zap" size={size} color="#eab308" />;
  };
}
