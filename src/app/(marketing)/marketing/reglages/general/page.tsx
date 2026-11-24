import type { Metadata } from "next";
import { GeneralSection } from "../general-section";

export const metadata: Metadata = { title: "Général" };

export default function GeneralPage() {
  return <GeneralSection />;
}
