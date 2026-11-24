export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "movies";
  const movieId = url.searchParams.get("movie_id");

  const supabaseUrl = (env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const supabaseKey = (env.SUPABASE_KEY || "").trim();

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Server config missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let endpoint = "";

  if (type === "movies") {
    endpoint = `${supabaseUrl}/rest/v1/movies?is_published=eq.true&order=created_at.desc`;
  } else if (type === "episodes" && movieId) {
    endpoint = `${supabaseUrl}/rest/v1/episodes?movie_id=eq.${encodeURIComponent(movieId)}&order=episode_number.asc`;
  } else if (type === "versions" && movieId) {
    endpoint = `${supabaseUrl}/rest/v1/movie_versions?select=*&movie_id=eq.${encodeURIComponent(movieId)}&order=sort_order.asc`;
  } else if (type === "settings") {
    endpoint = `${supabaseUrl}/rest/v1/site_settings?select=*`;
  } else if (type === "messages") {
    endpoint = `${supabaseUrl}/rest/v1/jj_messages?order=created_at.desc`;
  } else {
    return new Response(JSON.stringify({ error: "Invalid request type" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const headers = {
      apikey: supabaseKey,
      "Content-Type": "application/json"
    };

    // Only send Bearer token for legacy JWT keys (not sb_publishable_ keys)
    if (supabaseKey.startsWith("eyJ")) {
      headers.Authorization = `Bearer ${supabaseKey}`;
    }

    const res = await fetch(endpoint, { headers });
    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch data", details: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
