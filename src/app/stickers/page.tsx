import { StickerSheet } from "@/components/stickers/StickerSheet";

export const metadata = {
  title: "Room stickers - Ghost Watt",
  description: "Print a sticker for each scanned room: what sits idle after hours, and a QR code that opens a before-you-leave checklist.",
};

export default function StickersPage() {
  return <StickerSheet />;
}
