const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const TEMP_DIR = path.join(ROOT, "temp");
const LIBRARY_FOLDER_NAME = "DOAG_library01079854000989";

// Professional cross-platform path handling for cloud deployment
const DOWNLOADS_DIR = (process.platform === 'win32') 
  ? path.join(os.homedir(), "Downloads")
  : os.homedir(); 

const LIBRARY_DIR = path.join(DOWNLOADS_DIR, LIBRARY_FOLDER_NAME);
const MAX_BODY_SIZE = 1024 * 1024;
const MAX_URL_LENGTH = 4096;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

function safeLibraryPath(filename) {
  const base = path.basename(String(filename || ""));
  const resolved = path.join(LIBRARY_DIR, base);
  if (!resolved.startsWith(LIBRARY_DIR)) {
    throw new Error("Invalid library file.");
  }
  return resolved;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { error: "Not found" });
}

function sanitizeFilename(value) {
  const cleaned = String(value || "doag-audio")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "doag-audio";
}

function validateMediaUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("A media URL is required.");
  }
  if (value.length > MAX_URL_LENGTH) {
    throw new Error("The URL is too long.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https links are supported.");
  }

  return parsed.toString();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(text));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const error = new Error(stderr.trim() || `${command} exited with code ${code}`);
        error.code = code;
        error.stderr = stderr;
        reject(error);
      }
    });
  });
}

async function getMetadata(url) {
  const { stdout } = await runProcess("yt-dlp", [
    "--ignore-config",
    "--dump-single-json",
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "--js-runtimes", "node",
    url
  ]);
  const data = JSON.parse(stdout);
  return {
    id: data.id || crypto.randomUUID(),
    url,
    webpageUrl: data.webpage_url || url,
    title: data.title || "Untitled media",
    uploader: data.uploader || data.channel || data.extractor_key || "",
    platform: data.extractor_key || data.extractor || new URL(url).hostname,
    duration: Number(data.duration || 0),
    thumbnail: data.thumbnail || "",
    availability: data.availability || "",
    liveStatus: data.live_status || ""
  };
}

async function convertMedia(url, format) {
  if (!["mp3", "wav"].includes(format)) {
    throw new Error("Format must be mp3 or wav.");
  }

  await fsp.mkdir(TEMP_DIR, { recursive: true });
  const jobId = crypto.randomUUID();
  const jobDir = path.join(TEMP_DIR, jobId);
  await fsp.mkdir(jobDir, { recursive: true });

  const metadata = await getMetadata(url);
  const baseName = sanitizeFilename(metadata.title);
  const outputTemplate = path.join(jobDir, `${baseName}.%(ext)s`);
  const args = [
    "--ignore-config",
    "--no-playlist",
    "--js-runtimes", "node",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    format,
    "-o",
    outputTemplate,
    url
  ];
  const outputIndex = args.indexOf("-o");

  if (format === "mp3") {
    args.splice(outputIndex, 0, "--audio-quality", "0", "--postprocessor-args", "ffmpeg:-ar 44100");
  } else {
    args.splice(outputIndex, 0, "--postprocessor-args", "ffmpeg:-ar 44100 -ac 2 -sample_fmt s16");
  }

  await runProcess("yt-dlp", args, { cwd: jobDir });
  const files = await fsp.readdir(jobDir);
  const outputFile = files.find(file => file.toLowerCase().endsWith(`.${format}`));
  if (!outputFile) {
    throw new Error("Conversion finished, but the output file was not found.");
  }

  return {
    jobDir,
    filename: `${baseName}.${format}`,
    filepath: path.join(jobDir, outputFile),
    metadata
  };
}

async function saveToLibrary(result, format) {
  await fsp.mkdir(LIBRARY_DIR, { recursive: true });
  const target = path.join(LIBRARY_DIR, result.filename);
  await fsp.copyFile(result.filepath, target);
  const stat = await fsp.stat(target);
  const metadata = {
    filename: result.filename,
    title: result.metadata.title,
    thumbnail: result.metadata.thumbnail,
    platform: result.metadata.platform,
    uploader: result.metadata.uploader,
    duration: result.metadata.duration,
    originalUrl: result.metadata.webpageUrl || result.metadata.url,
    format,
    size: stat.size,
    downloadedAt: new Date().toISOString()
  };
  await fsp.writeFile(`${target}.doag.json`, JSON.stringify(metadata, null, 2), "utf8");
  return metadata;
}

async function listLibrary() {
  await fsp.mkdir(LIBRARY_DIR, { recursive: true });
  const entries = await fsp.readdir(LIBRARY_DIR, { withFileTypes: true });
  const audioFiles = entries
    .filter(entry => entry.isFile() && /\.(mp3|wav)$/i.test(entry.name))
    .map(entry => entry.name);

  const items = [];
  for (const filename of audioFiles) {
    const filepath = safeLibraryPath(filename);
    const stat = await fsp.stat(filepath);
    let metadata = {};
    try {
      metadata = JSON.parse(await fsp.readFile(`${filepath}.doag.json`, "utf8"));
    } catch {
      metadata = {};
    }
    items.push({
      filename,
      title: metadata.title || path.parse(filename).name,
      thumbnail: metadata.thumbnail || "",
      platform: metadata.platform || "",
      uploader: metadata.uploader || "",
      duration: metadata.duration || 0,
      originalUrl: metadata.originalUrl || "",
      format: metadata.format || path.extname(filename).slice(1).toLowerCase(),
      size: stat.size,
      downloadedAt: metadata.downloadedAt || stat.birthtime.toISOString(),
      fileUrl: `/api/library/file?name=${encodeURIComponent(filename)}`
    });
  }

  items.sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt));
  return items;
}

async function serveFile(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === "/") pathname = "/index.html";
  if (pathname === "/library" || pathname === "/library/") pathname = "/library/index.html";

  const normalized = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!normalized.startsWith(PUBLIC_DIR)) {
    notFound(res);
    return;
  }

  try {
    const stats = await fsp.stat(normalized);
    if (!stats.isFile()) {
      notFound(res);
      return;
    }

    const ext = path.extname(normalized).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    fs.createReadStream(normalized).pipe(res);
  } catch {
    notFound(res);
  }
}

async function deleteFromLibrary(filename) {
  const filepath = safeLibraryPath(filename);
  await fsp.unlink(filepath);
  try {
    await fsp.unlink(`${filepath}.doag.json`);
  } catch {
    // metadata might not exist
  }
}

async function handleApi(req, res) {
  if (req.method === "DELETE" && req.url?.startsWith("/api/library/")) {
    try {
      const filename = decodeURIComponent(req.url.split("/").pop());
      await deleteFromLibrary(filename);
      json(res, 200, { success: true });
    } catch (error) {
      json(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/library/file")) {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      const filename = requestUrl.searchParams.get("name");
      const filepath = safeLibraryPath(filename);
      const stat = await fsp.stat(filepath);
      const ext = path.extname(filepath).toLowerCase();
      res.writeHead(200, {
        "content-type": MIME_TYPES[ext] || "application/octet-stream",
        "content-length": stat.size,
        "cache-control": "private, max-age=3600"
      });
      fs.createReadStream(filepath).pipe(res);
    } catch (error) {
      json(res, 404, { error: error.message || "File not found" });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/library") {
    try {
      const items = await listLibrary();
      json(res, 200, { folder: LIBRARY_DIR, items });
    } catch (error) {
      json(res, 500, { error: error.message || "Could not read library." });
    }
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await readBody(req);
    console.log(`[API] ${req.url} Request for: ${body.url}`);
    const url = validateMediaUrl(body.url);

    if (req.url === "/api/metadata") {
      try {
        const metadata = await getMetadata(url);
        
        // Check if file exists in library
        const libraryItems = await listLibrary();
        const existing = libraryItems.find(item => item.originalUrl === metadata.webpageUrl || item.title === metadata.title);
        
        if (existing) {
          return json(res, 200, { 
            item: metadata, 
            exists: true, 
            message: `This song is already in your library.` 
          });
        }
        
        json(res, 200, { item: metadata, exists: false });
      } catch (err) {
        console.error(`[Metadata Error] ${err.message}`);
        json(res, 500, { error: err.message || "Could not fetch link metadata." });
      }
      return;
    }

    if (req.url === "/api/convert") {
      const format = String(body.format || "mp3").toLowerCase();
      const result = await convertMedia(url, format);
      await saveToLibrary(result, format);
      const mime = format === "wav" ? "audio/wav" : "audio/mpeg";
      const stat = await fsp.stat(result.filepath);
      const encoded = encodeURIComponent(result.filename).replace(/['()]/g, escape);

      res.writeHead(200, {
        "content-type": mime,
        "content-length": stat.size,
        "content-disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"; filename*=UTF-8''${encoded}`,
        "x-doag-title": encodeURIComponent(result.metadata.title),
        "cache-control": "no-store"
      });

      fs.createReadStream(result.filepath)
        .on("close", () => {
          fsp.rm(result.jobDir, { recursive: true, force: true }).catch(() => {});
        })
        .pipe(res);
      return;
    }

    notFound(res);
  } catch (error) {
    json(res, 400, {
      error: error.message || "Something went wrong.",
      detail: error.stderr ? error.stderr.split("\n").slice(-5).join("\n") : undefined
    });
  }
}

const server = http.createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  serveFile(req, res);
});

server.listen(PORT, () => {
  console.log(`DOAG Link running at http://localhost:${PORT}`);
});
