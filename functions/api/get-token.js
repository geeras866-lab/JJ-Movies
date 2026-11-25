async function resolveWorkerUrl(env) {
  const vaultUrl = String(env.VAULT_SUPABASE_URL || env.MAIN_SB_URL || "").trim();
  const vaultKey = String(
    env.VAULT_SERVICE_KEY || env.MAIN_SB_KEY || env.VAULT_ANON_KEY || ""
  ).trim();
  const fallbackUrl = String(env.STREAM_WORKER_URL || "").trim().replace(/\/+$/, "");

  if (vaultUrl && vaultKey) {
    try {
      const endpoint =
        vaultUrl.replace(/\/+$/, "") +
        "/rest/v1/cf_accounts?select=id,is_active,stream_url&is_active=eq.true&limit=1";

      const res = await fetch(endpoint, {
        cache: "no-store",
        headers: {
          apikey: vaultKey,
          Authorization: "Bearer " + vaultKey,
          "Cache-Control": "no-store"
        }
      });

      const bodyText = await res.text();
      if (res.ok) {
        const rows = JSON.parse(bodyText);
        const activeUrl =
          rows && rows[0] && rows[0].stream_url
            ? String(rows[0].stream_url).trim()
            : "";
        if (activeUrl && /^https?:\/\//i.test(activeUrl)) {
          return {
            workerUrl: activeUrl.replace(/\/+$/, ""),
            source: "vault_db",
            activeId: rows[0].id || null,
            vaultDebug: { ok: true, status: res.status, count: rows.length }
          };
        }
        return {
          workerUrl: fallbackUrl,
          source: "env_fallback",
          activeId: null,
          vaultDebug: { ok: true, status: res.status, count: rows.length, reason: "no_active_row_or_empty_url" }
        };
      }

      return {
        workerUrl: fallbackUrl,
        source: "env_fallback",
        activeId: null,
        vaultDebug: { ok: false, status: res.status, error: bodyText.slice(0, 120) }
      };
    } catch (err) {
      return {
        workerUrl: fallbackUrl,
        source: "env_fallback",
        activeId: null,
        vaultDebug: { ok: false, error: err && err.message ? err.message : String(err) }
      };
    }
  }

  return {
    workerUrl: fallbackUrl,
    source: "env_fallback",
    activeId: null,
    vaultDebug: { ok: false, reason: "missing_url_or_key" }
  };
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const rawFile = url.searchParams.get("file") || url.searchParams.get("ref") || "";
  const file = rawFile.trim().replace(/^\/+/, "");

  if (!file) {
    return new Response(JSON.stringify({ error: "Missing file parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }

  const secret = String(env.STREAM_APP_SECRET || env.APP_SECRET || "").trim();
  const { workerUrl, source, activeId, vaultDebug } = await resolveWorkerUrl(env);

  if (!secret || !workerUrl) {
    return new Response(
      JSON.stringify({
        error: "Stream config missing",
        hasSecret: Boolean(secret),
        hasWorkerUrl: Boolean(workerUrl),
        source,
        vault_debug: vaultDebug
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
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

    const text = await workerRes.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}

    const payload = parsed && typeof parsed === "object"
      ? { ...parsed, source, active_cf_id: activeId, vault_debug: vaultDebug }
      : { raw: text, source, active_cf_id: activeId, vault_debug: vaultDebug };

    return new Response(JSON.stringify(payload), {
      status: workerRes.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to reach stream worker",
        source,
        vault_debug: vaultDebug,
        details: err && err.message ? err.message : String(err)
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      }
    );
  }
}
