const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

ffmpeg.setFfmpegPath(ffmpegPath);

const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const id = crypto.randomUUID();
    cb(null, `${id}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("الملف يجب أن يكون فيديو"));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/enhance", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "لم يتم رفع فيديو"
    });
  }

  const input = req.file.path;
  const outputName = `${path.parse(req.file.filename).name}-4k60.mp4`;
  const output = path.join(outputsDir, outputName);

  ffmpeg(input)
    .videoCodec("libx264")
    .audioCodec("aac")
    .size("3840x2160")
    .fps(60)
    .outputOptions([
      "-preset veryfast",
      "-crf 20",
      "-pix_fmt yuv420p",
      "-movflags +faststart"
    ])
    .on("start", () => {
      console.log("بدأت معالجة الفيديو");
    })
    .on("progress", progress => {
      console.log(`Progress: ${progress.percent || 0}%`);
    })
    .on("end", () => {
      try {
        fs.unlinkSync(input);
      } catch {}

      res.json({
        success: true,
        message: "تمت معالجة الفيديو",
        download: `/api/download/${outputName}`
      });
    })
    .on("error", error => {
      console.error(error);

      try {
        fs.unlinkSync(input);
      } catch {}

      if (fs.existsSync(output)) {
        fs.unlinkSync(output);
      }

      res.status(500).json({
        error: "حدث خطأ أثناء معالجة الفيديو"
      });
    })
    .save(output);
});

app.get("/api/download/:file", (req, res) => {
  const filename = path.basename(req.params.file);
  const file = path.join(outputsDir, filename);

  if (!fs.existsSync(file)) {
    return res.status(404).send("الفيديو غير موجود");
  }

  res.download(file, filename);
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "VideoEnhance"
  });
});

app.listen(PORT, () => {
  console.log(`VideoEnhance running on port ${PORT}`);
});
