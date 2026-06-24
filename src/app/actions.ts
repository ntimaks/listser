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
  const rawType = String(formData.get("type") ?? "grocery");
  const type = ["grocery", "todo", "wishlist"].includes(rawType)
    ? rawType
    : "grocery";
  // store_name only means something for a grocery (per-store aisle learning).
  const storeName =
    type === "grocery"
      ? String(formData.get("store_name") ?? "").trim() || null
      : null;
  if (!name || !householdId) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lists")
    .insert({ household_id: householdId, name, store_name: storeName, type })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  revalidatePath("/");
  redirect(`/?list=${data.id}`);
}

export async function createTemplate(
  householdId: string,
  name: string,
  items: string[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .insert({ household_id: householdId, name, created_by: user.id })
    .select("id")
    .single();
  if (templateError) throw new Error(templateError.message);

  if (items.length > 0) {
    const rows = items.map((item_name, i) => ({
      template_id: template.id,
      item_name,
      sort_order: i,
    }));
    const { error: itemsError } = await supabase
      .from("template_items")
      .insert(rows);
    if (itemsError) throw new Error(itemsError.message);
  }

  revalidatePath("/");
}

export async function deleteList(listId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("lists").delete().eq("id", listId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function deleteTemplate(templateId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", templateId);
  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
