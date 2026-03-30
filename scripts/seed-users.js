import bcrypt from "bcryptjs";

import { getSupabaseAdmin } from "../lib/supabase.js";

const USERS = [
  { username: "user1", password: "pass1234", display_name: "User 1" },
  { username: "user2", password: "pass1234", display_name: "User 2" },
  { username: "user3", password: "pass1234", display_name: "User 3" },
  { username: "user4", password: "pass1234", display_name: "User 4" },
  { username: "user5", password: "pass1234", display_name: "User 5" }
];

async function seedUsers() {
  const client = getSupabaseAdmin();
  if (!client) {
    console.error("Supabase admin client not available — check credentials");
    process.exit(1);
  }

  let failed = false;

  for (const user of USERS) {
    try {
      const password_hash = await bcrypt.hash(user.password, 12);
      const { error } = await client
        .from("users")
        .upsert(
          { username: user.username, password_hash, display_name: user.display_name },
          { onConflict: "username" }
        );

      if (error) {
        console.error(`Failed to seed ${user.username}:`, error.message);
        failed = true;
      } else {
        console.log(`Seeded: ${user.username} (${user.display_name})`);
      }
    } catch (err) {
      console.error(`Error seeding ${user.username}:`, err.message);
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

seedUsers();
