import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://tswyabgdldbsaopipvug.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID || "-1004420066872";

if (!SUPABASE_SERVICE_KEY || !BOT_TOKEN) {
  console.error("Missing SUPABASE_SERVICE_KEY or BOT_TOKEN secrets!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadToTelegram(imageUrl, captionText) {
  const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      photo: imageUrl,
      caption: `🎬 ${captionText}`
    })
  });

  const sendData = await sendRes.json();
  if (!sendData.ok) {
    throw new Error(sendData.description || "Telegram photo upload failed");
  }

  const photos = sendData.result.photo;
  const fileId = photos[photos.length - 1].file_id;

  const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
  const fileData = await fileRes.json();
  if (!fileData.ok) {
    throw new Error("Telegram getFile failed");
  }

  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileData.result.file_path}`;
}

async function startMigration() {
  console.log("Migration process starting...");
  const { data: movies, error } = await supabase
    .from("movies")
    .select("id, title, poster_url");

  if (error) {
    console.error("Error fetching movies:", error.message);
    process.exit(1);
  }

  console.log(`Found ${movies.length} movies.`);

  for (const movie of movies) {
    if (movie.poster_url && movie.poster_url.includes("supabase.co")) {
      try {
        console.log(`Migrating: ${movie.title}...`);
        const newTelegramUrl = await uploadToTelegram(movie.poster_url, movie.title);

        const { error: updateError } = await supabase
          .from("movies")
          .update({ poster_url: newTelegramUrl })
          .eq("id", movie.id);

        if (updateError) {
          console.error(`DB Update fail for ${movie.title}:`, updateError.message);
        } else {
          console.log(`Successfully moved ${movie.title} to Telegram!`);
        }

        await sleep(1500); // Flood control
      } catch (err) {
        console.error(`Error migrating ${movie.title}:`, err.message);
      }
    } else {
      console.log(`Skipped: ${movie.title} (Already external)`);
    }
  }

  console.log("All done!");
}

startMigration();
