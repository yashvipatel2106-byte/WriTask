import { redirect } from "next/navigation";

export default function CreateOrganizationRedirect() {
  redirect("/settings/create-organization");
}
