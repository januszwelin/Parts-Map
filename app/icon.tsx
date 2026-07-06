import { ImageResponse } from "next/og";
import { Mark } from "@/app/icons/mark";

export const size = { width: 48, height: 48 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<Mark size={48} />, { ...size });
}
