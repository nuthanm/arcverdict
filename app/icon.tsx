import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f8f5",
          color: "#1b7a4e",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.4,
        }}
      >
        AV
      </div>
    ),
    size,
  );
}
