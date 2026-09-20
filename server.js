const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT =
  process.env.PORT || 10000;

ffmpeg.setFfmpegPath(ffmpegPath);

const uploadsDir =
  path.join(__dirname, "uploads");

const outputsDir =
  path.join(__dirname, "outputs");

const publicDir =
  path.join(__dirname, "public");

fs.mkdirSync(
  uploadsDir,
  { recursive: true }
);

fs.mkdirSync(
  outputsDir,
  { recursive: true }
);

fs.mkdirSync(
  publicDir,
  { recursive: true }
);

const storage =
  multer.diskStorage({

    destination:
      uploadsDir,

    filename:
      (req, file, cb) => {

        const id =
          crypto.randomUUID();

        const extension =
          path.extname(
            file.originalname
          );

        cb(
          null,
          `${id}${extension}`
        );

      }

  });

const upload =
  multer({

    storage,

    limits: {
      fileSize:
        500 * 1024 * 1024
    },

    fileFilter:
      (req, file, cb) => {

        if (
          file.mimetype &&
          file.mimetype.startsWith("video/")
        ) {

          cb(null, true);

        } else {

          cb(
            new Error(
              "الملف يجب أن يكون فيديو"
            )
          );

        }

      }

  });

app.use(express.json());

app.use(
  express.static(publicDir)
);

app.get(
  "/api/health",
  (req, res) => {

    res.json({
      status: "ok",
      service: "VideoEnhance",
      modes: [
        "TikTok Ready",
        "Real Frame Interpolation"
      ]
    });

  }
);

app.post(
  "/api/enhance",
  upload.single("video"),
  (req, res) => {

    if (!req.file) {

      return res.status(400).json({
        error:
          "لم يتم رفع فيديو"
      });

    }

    const input =
      req.file.path;

    const mode =
      String(
        req.body.mode || "tiktok"
      ).toLowerCase();

    const requestedFps =
      parseInt(
        req.body.fps || "60",
        10
      );

    const allowedFps =
      [60, 120, 240];

    const fps =
      allowedFps.includes(
        requestedFps
      )
        ? requestedFps
        : 60;

    const id =
      path.parse(
        req.file.filename
      ).name;

    let outputName;
    let output;
    let command;

    /*
      ========================================
      MODE 1
      TikTok Ready
      ========================================
    */

    if (mode === "tiktok") {

      outputName =
        `${id}-tiktok-ready.mp4`;

      output =
        path.join(
          outputsDir,
          outputName
        );

      const videoFilter =
        "scale=1080:1920:" +
        "force_original_aspect_ratio=decrease," +
        "pad=1080:1920:" +
        "(ow-iw)/2:" +
        "(oh-ih)/2," +
        "setsar=1";

      command =
        ffmpeg(input)
          .videoCodec("libx264")
          .audioCodec("aac")
          .videoFilters(
            videoFilter
          )
          .outputOptions([
            "-crf 18",
            "-preset medium",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-b:a 192k",
            "-r 60",
            "-g 120",
            "-vsync cfr"
          ]);

      console.log(
        "================================"
      );

      console.log(
        "MODE: TikTok Ready"
      );

      console.log(
        "Resolution: 1080x1920"
      );

      console.log(
        "================================"
      );

    }

    /*
      ========================================
      MODE 2
      REAL FRAME INTERPOLATION
      ========================================
    */

    else if (mode === "fps") {

      outputName =
        `${id}-${fps}fps-interpolated.mp4`;

      output =
        path.join(
          outputsDir,
          outputName
        );

      /*
        minterpolate يقوم بإنشاء
        فريمات جديدة بين الفريمات
        الأصلية.

        هذا مختلف عن:
        -r 120

        لأن -r وحده لا يصنع
        حركة جديدة حقيقية.
      */

      const interpolationFilter =
        `minterpolate=` +
        `fps=${fps}:` +
        `mi_mode=mci:` +
        `mc_mode=aobmc:` +
        `me_mode=bidir:` +
        `vsbmc=1`;

      command =
        ffmpeg(input)
          .videoCodec("libx264")
          .audioCodec("aac")
          .videoFilters(
            interpolationFilter
          )
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

      console.log(
        "================================"
      );

      console.log(
        "MODE: REAL FRAME INTERPOLATION"
      );

      console.log(
        "Target FPS:",
        fps
      );

      console.log(
        "================================"
      );

    }

    else {

      try {

        if (
          fs.existsSync(input)
        ) {
          fs.unlinkSync(input);
        }

      } catch {}

      return res.status(400).json({
        error:
          "نوع المعالجة غير صحيح"
      });

    }

    command.on(
      "start",
      commandLine => {

        console.log(
          "FFmpeg started:"
        );

        console.log(
          commandLine
        );

      }
    );

    command.on(
      "progress",
      progress => {

        const percent =
          Math.min(
            99,
            Math.max(
              1,
              Math.round(
                progress.percent || 1
              )
            )
          );

        console.log(
          `Processing: ${percent}%`
        );

      }
    );

    command.on(
      "end",
      () => {

        console.log(
          "================================"
        );

        console.log(
          "Processing completed"
        );

        console.log(
          "Output:",
          output
        );

        console.log(
          "================================"
        );

        try {

          if (
            fs.existsSync(input)
          ) {

            fs.unlinkSync(input);

          }

        } catch (error) {

          console.log(
            "تعذر حذف الملف الأصلي:",
            error.message
          );

        }

        if (
          !fs.existsSync(output)
        ) {

          return res.status(500).json({

            error:
              "تمت المعالجة لكن لم يتم إنشاء الفيديو"

          });

        }

        return res.json({

          success: true,

          mode:

            mode === "fps"
              ? "Real Frame Interpolation"
              : "TikTok Ready",

          fps:
            mode === "fps"
              ? fps
              : 60,

          resolution:
            mode === "tiktok"
              ? "1080x1920"
              : "Original",

          download:
            `/api/download/${encodeURIComponent(
              outputName
            )}`

        });

      }
    );

    command.on(
      "error",
      error => {

        console.error(
          "================================"
        );

        console.error(
          "FFmpeg ERROR"
        );

        console.error(
          error
        );

        console.error(
          "================================"
        );

        try {

          if (
            fs.existsSync(input)
          ) {

            fs.unlinkSync(input);

          }

        } catch {}

        try {

          if (
            fs.existsSync(output)
          ) {

            fs.unlinkSync(output);

          }

        } catch {}

        if (
          !res.headersSent
        ) {

          return res.status(500).json({

            error:
              "حدث خطأ أثناء معالجة الفيديو",

            details:
              error.message

          });

        }

      }
    );

    command.save(output);

  }
);

app.get(
  "/api/download/:file",
  (req, res) => {

    const filename =
      path.basename(
        req.params.file
      );

    const file =
      path.join(
        outputsDir,
        filename
      );

    if (
      !fs.existsSync(file)
    ) {

      return res.status(404).json({

        error:
          "الفيديو غير موجود"

      });

    }

    res.download(
      file,
      filename
    );

  }
);

app.use(
  (error, req, res, next) => {

    console.error(
      "Server error:",
      error
    );

    if (
      error instanceof
      multer.MulterError
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

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `VideoEnhance running on port ${PORT}`
    );

  }
);
