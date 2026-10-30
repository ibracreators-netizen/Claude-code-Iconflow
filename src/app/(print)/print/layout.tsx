export const metadata = { title: "Impression" };
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="light" className="min-h-dvh bg-white text-[#0b0f14] print:bg-white">{children}</div>;
}
