import type { Metadata } from "next";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "./globals.css";
import { RoomProvider } from "../features/session/RoomProvider";

export const metadata: Metadata = {
  title: "Astronaut Guild — Jezero Mission Command",
  description:
    "Coordinate a four-person Jezero science expedition with NASA orbital context and clearly labeled simulated planning risks.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body><RoomProvider>{children}</RoomProvider></body>
    </html>
  );
}
