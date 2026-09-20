const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

ffmpeg.setFfmpegPath(ffmpegPath);

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");
const publicDir = path.join(__dirname, "public");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });
fs.mkdirSync(publicDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    const extension = path.extname(file.originalname);
    cb(null, `${id}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("الملف يجب أن يكون فيديو"));
    }
  }
});

app.use(express.json());
app.use(express.static(publicDir));

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "VideoEnhance",
    mode: "TikTok Ready"
  });
});

app.post("/api/enhance", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "لم يتم رفع فيديو"
    });
  }

  const input = req.file.path;

  const requestedResolution =
    String(req.body.resolution || "1080p").toLowerCase();

  const requestedFps =
    parseInt(req.body.fps || "60", 10);

  const ai =
    String(req.body.ai || "false").toLowerCase() === "true";

  const allowedFps = [30, 60];

  const fps = allowedFps.includes(requestedFps)
    ? requestedFps
    : 60;

  let width = 1080;
  let height = 1920;

  if (requestedResolution === "720p") {
    width = 720;
    height = 1280;
  }

  if (
    requestedResolution === "4k" ||
    requestedResolution === "4k60"
  ) {
    width = 2160;
    height = 3840;
  }

  console.log("================================");
  console.log("TikTok Ready Processing");
  console.log("Resolution:", `${width}x${height}`);
  console.log("FPS:", fps);
  console.log("AI:", ai);
  console.log("Input:", input);
  console.log("================================");

  const id =
    path.parse(req.file.filename).name;

  const outputName =
    `${id}-tiktok-${width}x${height}-${fps}fps.mp4`;

  const output =
    path.join(outputsDir, outputName);

  const videoFilter =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,` +
    `setsar=1`;

  const command = ffmpeg(input)
    .videoCodec("libx264")
    .audioCodec("aac")
    .videoFilters(videoFilter)
    .outputOptions([
      "-crf 18",
      "-preset medium",
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      "-b:a 192k",
      `-r ${fps}`,
      `-g ${fps * 2}`,
      "-vsync cfr"
    ]);

  command.on("start", commandLine => {
    console.log("");
    console.log("FFmpeg started:");
    console.log(commandLine);
    console.log("");
  });

  command.on("progress", progress => {
    const percent =
      Math.min(
        99,
        Math.max(
          1,
          Math.round(progress.percent || 1)
        )
      );

    console.log(`Processing: ${percent}%`);
  });

  command.on("end", () => {
    console.log("");
    console.log("================================");
    console.log("TikTok video completed");
    console.log("Output:", output);
    console.log("================================");
    console.log("");

    try {
      if (fs.existsSync(input)) {
        fs.unlinkSync(input);
      }
    } catch (error) {
      console.log(
        "تعذر حذف الفيديو الأصلي:",
        error.message
      );
    }

    if (!fs.existsSync(output)) {
      return res.status(500).json({
        error:
          "تمت المعالجة لكن لم يتم إنشاء الفيديو"
      });
    }

    const downloadUrl =
      `${req.protocol}://${req.get("host")}/api/download/${encodeURIComponent(outputName)}`;

    return res.json({
      success: true,
      message:
        "تم تجهيز الفيديو لتيك توك",
      mode:
        "TikTok Ready",
      resolution:
        `${width}x${height}`,
      fps:
        fps,
      ai:
        ai,
      download:
        downloadUrl
    });
  });

  command.on("error", error => {
    console.error("");
    console.error("================================");
    console.error("FFmpeg ERROR");
    console.error(error);
    console.error("================================");
    console.error("");

    try {
      if (fs.existsSync(input)) {
        fs.unlinkSync(input);
      }
    } catch {}

    try {
      if (fs.existsSync(output)) {
        fs.unlinkSync(output);
      }
    } catch {}

    if (!res.headersSent) {
      return res.status(500).json({
        error:
          "حدث خطأ أثناء معالجة الفيديو",
        details:
          error.message
      });
    }
  });

  command.save(output);
});

app.get("/api/download/:file", (req, res) => {
  const filename =
    path.basename(req.params.file);

  const file =
    path.join(outputsDir, filename);

  if (!fs.existsSync(file)) {
    return res.status(404).json({
      error:
        "الفيديو غير موجود"
    });
  }

  res.download(
    file,
    filename
  );
});

app.use((error, req, res, next) => {
  console.error(
    "Server error:",
    error
  );

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      error:
        "حدث خطأ أثناء رفع الفيديو",
      details:
        error.message
    });
  }

  return res.status(500).json({
    error:
      error.message ||
      "حدث خطأ في السيرفر"
  });
});

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `VideoEnhance TikTok Ready running on port ${PORT}`
    );
  }
);
