async function getActiveWorkerUrl(env) {
  if (env.VAULT_SUPABASE_URL && env.VAULT_ANON_KEY) {
    try {
      const res = await fetch(
        `${env.VAULT_SUPABASE_URL}/rest/v1/rpc/get_active_stream_url`,
        {
          method: "POST",
          headers: {
            apikey: env.VAULT_ANON_KEY,
            Authorization: `Bearer ${env.VAULT_ANON_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({})
        }
      );

      if (res.ok) {
        const data = await res.json();
        const activeUrl = typeof data === "string" ? data : data?.url || data?.worker_url;
        if (activeUrl && activeUrl.startsWith("http")) {
          return activeUrl.replace(/\/+$/, "");
        }
      }
    } catch (_) {
      // Fallback to env.STREAM_WORKER_URL below
    }
  }

  return (env.STREAM_WORKER_URL || "").replace(/\/+$/, "");
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const file = url.searchParams.get("file");

  if (!file) {
    return new Response(JSON.stringify({ error: "Missing file parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const secret = env.STREAM_APP_SECRET;
  const workerUrl = await getActiveWorkerUrl(env);

  if (!secret || !workerUrl) {
    return new Response(JSON.stringify({ error: "Stream config missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // Nee existing worker.js /get-token endpoint ni server-side nundi call chesthundi
    const workerRes = await fetch(
      `${workerUrl}/get-token?file=${encodeURIComponent(file)}`,
      {
        method: "GET",
        headers: {
          "X-App-Key": secret,
          "Origin": "https://jj-movies.pages.dev"
        }
      }
    );

    const data = await workerRes.text();

    return new Response(data, {
      status: workerRes.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Failed to reach stream worker" }), {
      status: 502,
      headers: { "Content-Type": "application/json" }
    });
  }
}
