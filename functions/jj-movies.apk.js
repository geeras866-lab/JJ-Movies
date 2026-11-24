export async function onRequestGet(context) {
  const apkUrl = context.env.APK_DOWNLOAD_URL;
  if (!apkUrl) {
    return new Response("APK not configured", { status: 404 });
  }

  const res = await fetch(apkUrl, { redirect: "follow" });
  if (!res.ok) {
    return new Response("Download unavailable", { status: 502 });
  }

  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="jj-movies.apk"',
      "Cache-Control": "no-store"
    }
  });
}
