import { redirect } from "next/navigation";

/** Ancienne URL — tout passe par /dashboard (import YouTube / fichier). */
export default function ClipsIndexRedirect() {
  redirect("/dashboard");
}
