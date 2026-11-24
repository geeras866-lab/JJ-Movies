export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "movies";
  const movieId = url.searchParams.get("movie_id");

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_KEY;

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
    const res = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to fetch data" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
