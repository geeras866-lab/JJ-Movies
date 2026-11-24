async function getActiveWorkerUrl(env) {
  if (env.VAULT_SUPABASE_URL && env.VAULT_ANON_KEY) {
    try {
      const res = await fetch(
        `${env.VAULT_SUPABASE_URL.replace(/\/+$/, "")}/rest/v1/cf_accounts?select=stream_url&is_active=eq.true&limit=1`,
        {
          headers: {
            apikey: env.VAULT_ANON_KEY,
            Authorization: `Bearer ${env.VAULT_ANON_KEY}`
          }
        }
      );

      if (res.ok) {
        const rows = await res.json();
        const activeUrl = rows?.[0]?.stream_url ? String(rows[0].stream_url).trim() : "";
        if (activeUrl && activeUrl.startsWith("http")) {
          return activeUrl.replace(/\/+$/, "");
        }
      }
    } catch (_) {
      // Fallback to env.STREAM_WORKER_URL below
    }
  }

  return String(env.STREAM_WORKER_URL || "").trim().replace(/\/+$/, "");
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const rawFile = url.searchParams.get("file") || url.searchParams.get("ref") || "";
  const file = rawFile.trim().replace(/^\/+/, "");

  if (!file) {
    return new Response(JSON.stringify({ error: "Missing file parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const secret = String(env.STREAM_APP_SECRET || env.APP_SECRET || "").trim();
  const workerUrl = await getActiveWorkerUrl(env);

  if (!secret || !workerUrl) {
    return new Response(
      JSON.stringify({
        error: "Stream config missing",
        hasSecret: Boolean(secret),
        hasWorkerUrl: Boolean(workerUrl)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
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
    return new Response(
      JSON.stringify({ error: "Failed to reach stream worker", details: err.message }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
