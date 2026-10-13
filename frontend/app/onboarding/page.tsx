import { redirect } from "next/navigation";

/** Legacy path — wizard UI lives on /signup. */
export default function OnboardingRedirectPage() {
  redirect("/signup");
}
