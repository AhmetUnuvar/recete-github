import { Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const SCREEN_WIDTH = width;
export const SCREEN_HEIGHT = height;
export const HORIZONTAL_PADDING = Math.max(14, Math.min(20, Math.round(width * 0.05)));
export const CARD_PADDING = Math.max(16, Math.min(22, Math.round(width * 0.055)));
export const SIDEBAR_WIDTH = Math.max(220, Math.min(290, Math.round(width * 0.68)));
