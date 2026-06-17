import { redirect } from "next/navigation";

export default function PaginaInicio(): never {
  redirect("/login");
}
