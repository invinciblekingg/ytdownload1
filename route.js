import { NextResponse } from "next/server";

/**
 * POST /api/download
 * Body: { url: string }
 * Returns video info (title, channel, thumbnail, duration)
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const url = body?.url;

    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const vidId = extractVideoId(url);
    if (!vidId) {
      return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
    }

    // Try ytdl-core for full info, fall back to noembed (no API key needed)
    try {
      const { default: ytdl } = await import("@distube/ytdl-core");
      const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${vidId}`);
      const d = info.videoDetails;
      return NextResponse.json({
        success: true,
        video: {
          id: vidId,
          title: d.title,
          channel: d.author?.name,
          duration: d.lengthSeconds,
          views: d.viewCount,
          thumbnail: d.thumbnails?.at(-1)?.url ?? `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
        },
      });
    } catch {
      // ytdl unavailable — use noembed (always works)
      const r = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${vidId}`);
      const data = await r.json();
      return NextResponse.json({
        success: true,
        video: {
          id: vidId,
          title: data.title ?? "YouTube Video",
          channel: data.author_name ?? "Unknown",
          thumbnail: `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
          duration: null,
        },
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/download?url=...&format=mp4&quality=1080p
 * Streams the file OR redirects to cobalt.tools as fallback.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const format = searchParams.get("format") ?? "mp4";
  const quality = searchParams.get("quality") ?? "1080p";

  if (!url) {
    return NextResponse.json({ error: "url param required" }, { status: 400 });
  }

  try {
    const { default: ytdl } = await import("@distube/ytdl-core");
    const vidId = extractVideoId(url);
    const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${vidId}`);
    const title = info.videoDetails.title.replace(/[^\w\s-]/g, "").trim().slice(0, 60);

    let chosen;
    if (format === "mp3") {
      const fmts = ytdl.filterFormats(info.formats, "audioonly");
      chosen = fmts.sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0))[0];
    } else {
      const qualityMap = { "4K": "2160p", "1080p": "1080p", "720p": "720p", "480p": "480p", "360p": "360p" };
      const fmts = ytdl.filterFormats(info.formats, "videoandaudio");
      chosen = fmts.find(f => f.qualityLabel === (qualityMap[quality] ?? "1080p"))
             ?? fmts.find(f => f.qualityLabel === "720p")
             ?? fmts[0];
    }

    if (!chosen) throw new Error("No format found");

    const stream = ytdl(`https://www.youtube.com/watch?v=${vidId}`, { format: chosen });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    const ext = format === "mp3" ? "mp3" : format;
    const mime = { mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg" }[format] ?? "video/mp4";

    return new Response(buf, {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(title)}.${ext}"`,
        "Content-Length": String(buf.length),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    // Graceful fallback to cobalt.tools (free, no sign-up)
    return NextResponse.redirect(`https://cobalt.tools/#u=${encodeURIComponent(url)}`);
  }
}

function extractVideoId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{6,})/);
  return m?.[1] ?? null;
}
