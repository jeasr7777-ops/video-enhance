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


// ===============================
// HEALTH
// ===============================

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "VideoEnhance"
  });
});


// ===============================
// VIDEO ENHANCE
// ===============================

app.post("/api/enhance", upload.single("video"), (req, res) => {

  if (!req.file) {
    return res.status(400).json({
      error: "لم يتم رفع فيديو"
    });
  }

  const input = req.file.path;

  // الخيارات القادمة من الموقع
  const requestedResolution = String(
    req.body.resolution || "720p"
  ).toLowerCase();

  const requestedFps = parseInt(
    req.body.fps || "30",
    10
  );

  const ai = String(
    req.body.ai || "false"
  ).toLowerCase() === "true";


  // ===============================
  // RESOLUTION
  // ===============================

  const resolutions = {
    "720p": "1280x720",
    "1080p": "1920x1080",
    "4k": "3840x2160",
    "4k60": "3840x2160"
  };

  const resolution =
    resolutions[requestedResolution] || "1280x720";


  // ===============================
  // FPS
  // ===============================

  const allowedFps = [30, 60, 90, 120];

  const fps = allowedFps.includes(requestedFps)
    ? requestedFps
    : 30;


  // ===============================
  // AI
  // ===============================
  // ملاحظة:
  // هذا حاليًا لا يشغل AI حقيقي.
  // سنضيف محرك AI فعلي لاحقًا.

  console.log("================================");
  console.log("بدأت معالجة الفيديو");
  console.log("Resolution:", resolution);
  console.log("FPS:", fps);
  console.log("AI:", ai);
  console.log("Input:", input);
  console.log("================================");


  const id = path.parse(req.file.filename).name;

  const outputName =
    `${id}-${requestedResolution}-${fps}fps.mp4`;

  const output =
    path.join(outputsDir, outputName);


  // ===============================
  // FFMPEG
  // ===============================

  let command = ffmpeg(input)

    .videoCodec("libx264")

    .audioCodec("aac")

    .size(resolution)

    .fps(fps)

    .outputOptions([
      "-preset ultrafast",
      "-crf 23",
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      "-threads 1"
    ]);


  command

    .on("start", commandLine => {

      console.log("");
      console.log("FFmpeg started:");
      console.log(commandLine);
      console.log("");

    })


    .on("progress", progress => {

      const percent = Math.round(
        progress.percent || 0
      );

      console.log(
        `Progress: ${percent}%`
      );

    })


    .on("end", () => {

      console.log("");
      console.log("================================");
      console.log("تمت معالجة الفيديو بنجاح");
      console.log("Output:", output);
      console.log("================================");
      console.log("");

      // حذف الفيديو الأصلي
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


      // التأكد أن الملف الناتج موجود
      if (!fs.existsSync(output)) {

        return res.status(500).json({
          error: "تمت المعالجة لكن لم يتم إنشاء الملف الناتج"
        });

      }


      return res.json({

        success: true,

        message: "تمت معالجة الفيديو بنجاح",

        resolution: requestedResolution,

        fps: fps,

        ai: ai,

        download:
          `/api/download/${outputName}`

      });

    })


    .on("error", error => {

      console.error("");
      console.error("================================");
      console.error("FFmpeg ERROR");
      console.error(error);
      console.error("================================");
      console.error("");


      // حذف الفيديو الأصلي
      try {

        if (fs.existsSync(input)) {
          fs.unlinkSync(input);
        }

      } catch {}


      // حذف الملف الناتج إذا وجد
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


// ===============================
// DOWNLOAD
// ===============================

app.get("/api/download/:file", (req, res) => {

  const filename =
    path.basename(req.params.file);

  const file =
    path.join(outputsDir, filename);


  if (!fs.existsSync(file)) {

    return res.status(404).json({

      error: "الفيديو غير موجود"

    });

  }


  res.download(
    file,
    filename
  );

});


// ===============================
// ERROR HANDLER
// ===============================

app.use((error, req, res, next) => {

  console.error("Server error:", error);


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
      error.message || "حدث خطأ في السيرفر"

  });

});


// ===============================
// START SERVER
// ===============================

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `VideoEnhance running on port ${PORT}`
    );

  }
);
