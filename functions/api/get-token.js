async function signToken(secret, message) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

  // 10 minutes expiry
  const exp = Math.floor(Date.now() / 1000) + 600;
  const payload = `${file}:${exp}`;
  const token = await signToken(secret, payload);

  const streamUrl = `${workerUrl}/stream?file=${encodeURIComponent(file)}&exp=${exp}&token=${token}`;

  return new Response(JSON.stringify({ url: streamUrl, exp }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
