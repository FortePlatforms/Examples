import { redirect } from "next/navigation";

// "/" is excluded from authentication, so signed-out visitors land here instead of getting a 401.
// The login page sends signed-in users on to the dashboard.
export default function Home() {
  redirect("/login");
}
