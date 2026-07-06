import { ImageResponse } from "next/og";
import { Mark } from "@/app/icons/mark";

export async function GET() {
  return new ImageResponse(<Mark size={512} />, { width: 512, height: 512 });
}
