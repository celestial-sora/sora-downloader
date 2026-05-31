import "./globals.css";

export const metadata = {
  title: "Sora Downloader | โหลดวิดีโอ YouTube",
  description: "ดาวน์โหลดวิดีโอและเสียงจาก YouTube ในคุณภาพสูงสุด รวดเร็วและไม่มีโฆษณากวนใจ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
