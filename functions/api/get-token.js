async function getActiveWorkerUrl(env) {
  const vaultUrl = String(env.VAULT_SUPABASE_URL || env.MAIN_SB_URL || "").trim();
  const vaultKey = String(
    env.VAULT_SERVICE_KEY || env.MAIN_SB_KEY || env.VAULT_ANON_KEY || ""
  ).trim();

  if (vaultUrl && vaultKey) {
    try {
      const endpoint =
        vaultUrl.replace(/\/+$/, "") +
        "/rest/v1/cf_accounts?select=stream_url&is_active=eq.true&limit=1";

      const res = await fetch(endpoint, {
        cache: "no-store",
        headers: {
          apikey: vaultKey,
          Authorization: "Bearer " + vaultKey,
          "Cache-Control": "no-store"
        }
      });

      if (res.ok) {
        const rows = await res.json();
        const activeUrl =
          rows && rows[0] && rows[0].stream_url
            ? String(rows[0].stream_url).trim()
            : "";

        if (activeUrl && /^https?:\/\//i.test(activeUrl)) {
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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
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
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  try {
    const workerRes = await fetch(
      workerUrl + "/get-token?file=" + encodeURIComponent(file),
      {
        method: "GET",
        cache: "no-store",
        headers: {
          "X-App-Key": secret,
          "Origin": "https://jj-movies.pages.dev",
          "Cache-Control": "no-store"
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
      JSON.stringify({
        error: "Failed to reach stream worker",
        details: err && err.message ? err.message : String(err)
      }),
      {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
