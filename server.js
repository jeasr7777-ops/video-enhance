const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;

// Render Docker installs FFmpeg here
const FFMPEG_PATH = "/usr/bin/ffmpeg";

if (!fs.existsSync(FFMPEG_PATH)) {
  console.error("FFmpeg not found:", FFMPEG_PATH);
} else {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
}


// ========================================
// DIRECTORIES
// ========================================

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");
const outputsDir = path.join(__dirname, "outputs");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(outputsDir, { recursive: true });


// ========================================
// MULTER
// ========================================

const storage = multer.diskStorage({

  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },

  filename: function (req, file, cb) {

    const id =
      crypto.randomBytes(16).toString("hex");

    const ext =
      path.extname(file.originalname) || ".mp4";

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
      cb(
        new Error("الملف يجب أن يكون فيديو")
      );
    }
  }
});


app.use(express.json());

app.use(
  express.static(publicDir)
);


// ========================================
// HEALTH
// ========================================

app.get(
  "/api/health",
  function (req, res) {

    res.json({
      success: true,
      service: "Video Enhance",
      status: "online"
    });
  }
);


// ========================================
// ENHANCE
// ========================================

app.post(
  "/api/enhance",
  upload.single("video"),

  function (req, res) {

    if (!req.file) {

      return res.status(400).json({

        success: false,

        error:
          "لم يتم رفع فيديو"
      });
    }


    const input =
      req.file.path;


    // ====================================
    // READ SETTINGS
    // ====================================

    let operation =
      String(
        req.body.operation || ""
      );


    let resolution =
      String(
        req.body.resolution || "720p"
      );


    let fps =
      parseInt(
        req.body.fps || "30",
        10
      );


    const tiktok =
      String(
        req.body.tiktok || "false"
      ) === "true";


    const hd =
      String(
        req.body.hd || "false"
      ) === "true";


    const smooth =
      String(
        req.body.smooth || "false"
      ) === "true";


    // ====================================
    // ALLOWED FPS
    // ====================================

    const allowedFps = [
      30,
      60,
      120,
      240
    ];


    if (
      !allowedFps.includes(fps)
    ) {
      fps = 30;
    }


    // ====================================
    // OPERATION
    // ====================================

    let useInterpolation = false;


    if (
      operation === "fps" ||
      operation === "smooth" ||
      smooth
    ) {

      useInterpolation = true;
    }


    // ====================================
    // OUTPUT
    // ====================================

    const id =
      path.parse(
        req.file.filename
      ).name;


    const outputName =
      id + "-processed.mp4";


    const output =
      path.join(
        outputsDir,
        outputName
      );


    console.log("");
    console.log("================================");
    console.log("VIDEO ENHANCE");
    console.log("================================");
    console.log(
      "Operation:",
      operation
    );
    console.log(
      "Resolution:",
      resolution
    );
    console.log(
      "FPS:",
      fps
    );
    console.log(
      "TikTok:",
      tiktok
    );
    console.log(
      "HD:",
      hd
    );
    console.log(
      "Interpolation:",
      useInterpolation
    );
    console.log(
      "Input:",
      input
    );
    console.log(
      "Output:",
      output
    );
    console.log("================================");


    // ====================================
    // FFMPEG
    // ====================================

    let command =
      ffmpeg(input);


    const filters = [];


    // ====================================
    // TIKTOK
    // ====================================

    if (
      tiktok ||
      operation === "tiktok"
    ) {

      filters.push(
        "scale=1080:1920:" +
        "force_original_aspect_ratio=decrease:" +
        "flags=bicubic"
      );


      filters.push(
        "pad=1080:1920:" +
        "(ow-iw)/2:" +
        "(oh-ih)/2"
      );


      filters.push(
        "setsar=1"
      );


      fps = 30;
    }


    // ====================================
    // 720P
    // ====================================

    if (
      !tiktok &&
      operation !== "tiktok" &&
      resolution === "720p"
    ) {

      filters.push(
        "scale=1280:720:" +
        "force_original_aspect_ratio=decrease:" +
        "flags=bicubic"
      );


      filters.push(
        "pad=1280:720:" +
        "(ow-iw)/2:" +
        "(oh-ih)/2"
      );


      filters.push(
        "setsar=1"
      );
    }


    // ====================================
    // 1080P
    // ====================================

    if (
      !tiktok &&
      operation !== "tiktok" &&
      resolution === "1080p"
    ) {

      filters.push(
        "scale=1920:1080:" +
        "force_original_aspect_ratio=decrease:" +
        "flags=bicubic"
      );


      filters.push(
        "pad=1920:1080:" +
        "(ow-iw)/2:" +
        "(oh-ih)/2"
      );


      filters.push(
        "setsar=1"
      );
    }


    // ====================================
    // HD
    // ====================================

    if (
      hd ||
      operation === "hd"
    ) {

      filters.push(
        "unsharp=5:5:0.35:5:5:0"
      );
    }


    // ====================================
    // FRAME INTERPOLATION
    // ====================================

    if (
      useInterpolation &&
      fps > 30
    ) {

      console.log(
        "================================"
      );

      console.log(
        "FRAME INTERPOLATION:",
        fps,
        "FPS"
      );

      console.log(
        "================================"
      );


      /*
        هذه إعدادات أخف من الإعداد السابق.
        الهدف تقليل استهلاك المعالج والذاكرة
        على Render.
      */

      filters.push(
        "minterpolate=" +
        "fps=" + fps +
        ":mi_mode=blend"
      );
    }


    // ====================================
    // APPLY FILTERS
    // ====================================

    if (
      filters.length > 0
    ) {

      command =
        command.videoFilters(
          filters
        );
    }


    // ====================================
    // CODECS
    // ====================================

    command =
      command
        .videoCodec("libx264")
        .audioCodec("aac");


    // ====================================
    // OUTPUT OPTIONS
    // ====================================

    const outputOptions = [

      "-pix_fmt",
      "yuv420p",

      "-movflags",
      "+faststart",

      "-b:a",
      "128k",

      /*
        نترك نواة واحدة للـFFmpeg
        حتى يبقى Node/Render قادرًا
        على الاستجابة.
      */

      "-threads",
      "1",

      /*
        أسرع من medium
      */

      "-preset",
      "ultrafast"
    ];


    // ====================================
    // FPS
    // ====================================

    outputOptions.push(
      "-r",
      String(fps)
    );


    // ====================================
    // QUALITY
    // ====================================

    if (
      hd ||
      operation === "hd"
    ) {

      outputOptions.push(
        "-crf",
        "20"
      );

    } else {

      outputOptions.push(
        "-crf",
        "23"
      );
    }


    command =
      command.outputOptions(
        outputOptions
      );


    // ====================================
    // START
    // ====================================

    command.on(
      "start",
      function (commandLine) {

        console.log("");
        console.log(
          "FFmpeg started:"
        );

        console.log(
          commandLine
        );

        console.log("");
      }
    );


    // ====================================
    // PROGRESS
    // ====================================

    command.on(
      "progress",
      function (progress) {

        if (
          progress &&
          typeof progress.percent ===
            "number"
        ) {

          console.log(
            "Processing:",
            Math.round(
              progress.percent
            ) + "%"
          );
        }
      }
    );


    // ====================================
    // END
    // ====================================

    command.on(
      "end",
      function () {

        console.log("");
        console.log(
          "================================"
        );
        console.log(
          "PROCESSING COMPLETED"
        );
        console.log(
          "================================"
        );


        if (
          !fs.existsSync(output)
        ) {

          console.error(
            "Output file missing"
          );


          try {

            if (
              fs.existsSync(input)
            ) {
              fs.unlinkSync(input);
            }

          } catch (e) {}


          return res.status(500).json({

            success: false,

            error:
              "تمت المعالجة ولكن لم يتم إنشاء الفيديو"
          });
        }


        // =================================
        // DELETE INPUT
        // =================================

        try {

          if (
            fs.existsSync(input)
          ) {

            fs.unlinkSync(input);
          }

        } catch (error) {

          console.log(
            "Could not delete input:",
            error.message
          );
        }


        // =================================
        // RESPONSE
        // =================================

        return res.json({

          success: true,

          download:
            "/api/download/" +
            encodeURIComponent(
              outputName
            )
        });
      }
    );


    // ====================================
    // ERROR
    // ====================================

    command.on(
      "error",
      function (error) {

        console.error("");
        console.error(
          "================================"
        );
        console.error(
          "FFMPEG ERROR"
        );
        console.error(
          "================================"
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

        } catch (e) {}


        try {

          if (
            fs.existsSync(output)
          ) {

            fs.unlinkSync(output);
          }

        } catch (e) {}


        if (
          !res.headersSent
        ) {

          return res.status(500).json({

            success: false,

            error:
              "حدث خطأ أثناء معالجة الفيديو",

            details:
              error.message
          });
        }
      }
    );


    // ====================================
    // RUN
    // ====================================

    try {

      command.save(output);

    } catch (error) {

      console.error(
        "FFmpeg start error:",
        error
      );


      if (
        !res.headersSent
      ) {

        return res.status(500).json({

          success: false,

          error:
            "تعذر بدء معالجة الفيديو",

          details:
            error.message
        });
      }
    }
  }
);


// ========================================
// DOWNLOAD
// ========================================

app.get(
  "/api/download/:file",
  function (req, res) {

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

        success: false,

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


// ========================================
// ERROR HANDLER
// ========================================

app.use(
  function (
    error,
    req,
    res,
    next
  ) {

    console.error(
      "SERVER ERROR:",
      error
    );


    if (
      error instanceof
      multer.MulterError
    ) {

      return res.status(400).json({

        success: false,

        error:
          "حدث خطأ أثناء رفع الفيديو",

        details:
          error.message
      });
    }


    return res.status(500).json({

      success: false,

      error:
        error.message ||
        "حدث خطأ في السيرفر"
    });
  }
);


// ========================================
// START SERVER
// ========================================

app.listen(
  PORT,
  "0.0.0.0",
  function () {

    console.log("");
    console.log(
      "================================"
    );
    console.log(
      "Video Enhance running on port " +
      PORT
    );
    console.log(
      "================================"
    );
    console.log("");
  }
);
