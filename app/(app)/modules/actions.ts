"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/libs/supabase/server";

export async function toggleModule(formData: FormData) {
  const slug = formData.get("slug") as string;
  const enable = formData.get("enable") === "true";

  const supabase = createClient();
  const {
    data: { user },
  } = await (await supabase).auth.getUser();
  if (!user) return;

  if (enable) {
    await (await supabase)
      .from("modules_enabled")
      .upsert(
        { user_id: user.id, module_slug: slug, enabled: true },
        { onConflict: "user_id,module_slug" }
      );
  } else {
    await (await supabase)
      .from("modules_enabled")
      .update({ enabled: false })
      .eq("user_id", user.id)
      .eq("module_slug", slug);
  }

  revalidatePath("/modules");
  revalidatePath("/dashboard");
}
