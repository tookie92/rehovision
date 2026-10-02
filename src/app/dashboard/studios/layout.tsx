import { redirect } from "next/navigation";

/** Faceless gelé — toute route /dashboard/studios → hub clips. */
export default function StudiosFrozenLayout() {
  redirect("/dashboard");
}
