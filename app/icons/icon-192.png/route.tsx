import { ImageResponse } from "next/og";
import { Mark } from "@/app/icons/mark";

export async function GET() {
  return new ImageResponse(<Mark size={192} />, { width: 192, height: 192 });
}
