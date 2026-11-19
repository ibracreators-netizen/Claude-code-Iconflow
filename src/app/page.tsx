import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { homeFor } from "@/lib/permissions";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(homeFor(session.profile));
}
