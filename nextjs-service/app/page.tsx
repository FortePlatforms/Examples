import { redirect } from "next/navigation";

// Middleware will redirect unauthenticated visitors to /login. Authenticated
// requests fall through to here, where we forward to the dashboard.
export default function Home() {
  redirect("/dashboard");
}
