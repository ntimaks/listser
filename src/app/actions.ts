"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createHousehold(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { p_name: name });
  if (error) throw new Error(error.message);

  revalidatePath("/");
  redirect("/");
}

export async function createList(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const householdId = String(formData.get("household_id") ?? "");
  if (!name || !householdId) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .insert({ household_id: householdId, name })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  redirect(`/?list=${data.id}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
