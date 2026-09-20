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

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },

  filename: function (req, file, cb) {
    const id = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname) || ".mp4";

    cb(null, id + ext);
  }
});

const upload = multer({
  storage: storage,

  limits: {
    fileSize: 500 * 1024 * 1024
  },

  fileFilter: function (req, file, cb) {
    if (
      file.mimetype &&
      file.mimetype.startsWith("video/")
    ) {
      cb(null, true);
    } else {
      cb(new Error("الملف يجب أن يكون فيديو"));
    }
  }
});

app.use(express.json());
app.use(express.static(publicDir));


// ================================
// HEALTH CHECK
// ================================

app.get("/api/health", function (req, res) {
  res.json({
    success: true,
    service: "Video Enhance",
    status: "online"
  });
});


// ================================
// VIDEO PROCESSING
// ================================

app.post(
  "/api/enhance",
  upload.single("video"),
  function (req, res) {

    if (!req.file) {
      return res.status(400).json({
        error: "لم يتم رفع فيديو"
      });
    }

    const input = req.file.path;

    const resolution =
      String(req.body.resolution || "720p");

    const fps =
      parseInt(req.body.fps || "30", 10);

    const tiktok =
      String(req.body.tiktok || "false") === "true";

    const hd =
      String(req.body.hd || "false") === "true";

    const smooth =
      String(req.body.smooth || "false") === "true";

    const allowedFps = [30, 60, 90, 120, 240];

    const selectedFps =
      allowedFps.includes(fps) ? fps : 30;

    const id =
      path.parse(req.file.filename).name;

    const outputName =
      id + "-processed.mp4";

    const output =
      path.join(outputsDir, outputName);


    console.log("");
    console.log("================================");
    console.log("VIDEO ENHANCE");
    console.log("================================");
    console.log("Input:", input);
    console.log("Resolution:", resolution);
    console.log("FPS:", selectedFps);
    console.log("TikTok:", tiktok);
    console.log("HD:", hd);
    console.log("Smooth:", smooth);
    console.log("Output:", output);
    console.log("================================");


    let command = ffmpeg(input);

    const filters = [];


    // =================================
    // TIKTOK READY
    // =================================

    if (tiktok) {

      filters.push(
        "scale=1080:1920:" +
        "force_original_aspect_ratio=decrease:" +
        "flags=lanczos"
      );

      filters.push(
        "pad=1080:1920:" +
        "(ow-iw)/2:" +
        "(oh-ih)/2"
      );

      filters.push("setsar=1");
    }


    // =================================
    // NORMAL RESOLUTION
    // =================================

    if (!tiktok) {

      if (resolution === "720p") {

        filters.push(
          "scale=1280:720:" +
          "force_original_aspect_ratio=decrease:" +
          "flags=lanczos"
        );

        filters.push(
          "pad=1280:720:" +
          "(ow-iw)/2:" +
          "(oh-ih)/2"
        );

      }


      if (resolution === "1080p") {

        filters.push(
          "scale=1920:1080:" +
          "force_original_aspect_ratio=decrease:" +
          "flags=lanczos"
        );

        filters.push(
          "pad=1920:1080:" +
          "(ow-iw)/2:" +
          "(oh-ih)/2"
        );

      }


      if (
        resolution === "4k" ||
        resolution === "4k60"
      ) {

        filters.push(
          "scale=3840:2160:" +
          "force_original_aspect_ratio=decrease:" +
          "flags=lanczos"
        );

        filters.push(
          "pad=3840:2160:" +
          "(ow-iw)/2:" +
          "(oh-ih)/2"
        );

      }

      filters.push("setsar=1");
    }


    // =================================
    // HD
    // =================================

    if (hd) {

      filters.push(
        "unsharp=5:5:0.7:5:5:0.0"
      );
    }


    // =================================
    // SMOOTH / FRAME INTERPOLATION
    // =================================

    if (smooth) {

      filters.push(
        "minterpolate=" +
        "fps=" + selectedFps +
        ":mi_mode=mci" +
        ":mc_mode=aobmc" +
        ":me_mode=bidir" +
        ":vsbmc=1"
      );
    }


    if (filters.length > 0) {

      command = command.videoFilters(filters);
    }


    // =================================
    // VIDEO CODEC
    // =================================

    command =
      command
        .videoCodec("libx264")
        .audioCodec("aac");


    // =================================
    // OUTPUT OPTIONS
    // =================================

    const outputOptions = [
      "-pix_fmt yuv420p",
      "-movflags +faststart",
      "-b:a 192k"
    ];


    if (smooth) {

      outputOptions.push(
        "-r",
        String(selectedFps)
      );

    } else {

      if (tiktok) {

        outputOptions.push(
          "-r",
          "60"
        );

      } else {

        outputOptions.push(
          "-r",
          String(selectedFps)
        );
      }
    }


    // =================================
    // QUALITY
    // =================================

    if (hd) {

      outputOptions.push(
        "-crf",
        "17"
      );

      outputOptions.push(
        "-preset",
        "medium"
      );

    } else {

      outputOptions.push(
        "-crf",
        "20"
      );

      outputOptions.push(
        "-preset",
        "medium"
      );
    }


    command =
      command.outputOptions(outputOptions);


    // =================================
    // START
    // =================================

    command.on(
      "start",
      function (commandLine) {

        console.log("");
        console.log("FFmpeg started:");
        console.log(commandLine);
        console.log("");
      }
    );


    // =================================
    // PROGRESS
    // =================================

    command.on(
      "progress",
      function (progress) {

        if (progress.percent) {

          console.log(
            "Processing:",
            Math.round(progress.percent) + "%"
          );
        }
      }
    );


    // =================================
    // FINISHED
    // =================================

    command.on(
      "end",
      function () {

        console.log("");
        console.log("================================");
        console.log("PROCESSING COMPLETED");
        console.log("================================");


        if (!fs.existsSync(output)) {

          console.error(
            "Output file was not created"
          );

          return res.status(500).json({
            error:
              "تمت المعالجة ولكن لم يتم إنشاء الفيديو"
          });
        }


        try {

          if (fs.existsSync(input)) {
            fs.unlinkSync(input);
          }

        } catch (error) {

          console.log(
            "Could not delete input:",
            error.message
          );
        }


        return res.json({

          success: true,

          download:
            "/api/download/" +
            encodeURIComponent(outputName)

        });
      }
    );


    // =================================
    // ERROR
    // =================================

    command.on(
      "error",
      function (error) {

        console.error("");
        console.error("================================");
        console.error("FFMPEG ERROR");
        console.error(error);
        console.error("================================");
        console.error("");


        try {

          if (fs.existsSync(input)) {
            fs.unlinkSync(input);
          }

        } catch (e) {}


        try {

          if (fs.existsSync(output)) {
            fs.unlinkSync(output);
          }

        } catch (e) {}


        if (!res.headersSent) {

          return res.status(500).json({

            error:
              "حدث خطأ أثناء معالجة الفيديو",

            details:
              error.message

          });
        }
      }
    );


    // =================================
    // RUN FFMPEG
    // =================================

    command.save(output);
  }
);


// =================================
// DOWNLOAD
// =================================

app.get(
  "/api/download/:file",
  function (req, res) {

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
  }
);


// =================================
// ERROR HANDLER
// =================================

app.use(
  function (error, req, res, next) {

    console.error(
      "SERVER ERROR:",
      error
    );


    if (
      error instanceof multer.MulterError
    ) {

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
  }
);


// =================================
// START SERVER
// =================================

app.listen(
  PORT,
  "0.0.0.0",
  function () {

    console.log("");
    console.log(
      "Video Enhance running on port " +
      PORT
    );
    console.log("");
  }
);
