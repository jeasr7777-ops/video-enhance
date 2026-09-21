const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 10000;
const FFMPEG_PATH = "/usr/bin/ffmpeg";


// ========================================
// FFMPEG
// ========================================

if (fs.existsSync(FFMPEG_PATH)) {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
} else {
  console.error("FFmpeg not found:", FFMPEG_PATH);
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

    const id = crypto.randomBytes(16).toString("hex");

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

app.use(express.static(publicDir));


// ========================================
// HEALTH
// ========================================

app.get("/api/health", function (req, res) {

  res.json({
    success: true,
    service: "Video Enhance",
    status: "online"
  });

});


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

        error: "لم يتم رفع فيديو"

      });

    }


    const input = req.file.path;


    // ====================================
    // SETTINGS
    // ====================================

    let operation =
      String(req.body.operation || "tiktok");

    let fps =
      parseInt(req.body.fps || "30", 10);


    const tiktok =
      String(req.body.tiktok || "false") === "true";


    // ====================================
    // ALLOWED FPS
    // ====================================

    const allowedFps = [
      30,
      60,
      90,
      120
    ];


    if (!allowedFps.includes(fps)) {
      fps = 60;
    }


    // ====================================
    // TIKTOK
    // ====================================

    if (operation === "tiktok" || tiktok) {

      operation = "tiktok";

      fps = 30;

    }


    // ====================================
    // OUTPUT
    // ====================================

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
    console.log("Operation:", operation);
    console.log("FPS:", fps);
    console.log("TikTok:", tiktok);
    console.log("Input:", input);
    console.log("Output:", output);
    console.log("================================");


    // ====================================
    // FFMPEG
    // ====================================

    let command = ffmpeg(input);

    const filters = [];


    // ====================================
    // TIKTOK READY
    // ====================================

    if (operation === "tiktok") {

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

      filters.push(
        "setsar=1"
      );

    }


    // ====================================
    // FRAME INTERPOLATION
    // ====================================

    if (
      operation === "fps" &&
      fps > 30
    ) {

      console.log("");
      console.log("================================");
      console.log("FRAME INTERPOLATION");
      console.log("Target:", fps, "FPS");
      console.log("================================");


      /*
        Motion-compensated interpolation.

        هذا ليس مجرد تغيير رقم FPS.
        FFmpeg يقوم بإنشاء إطارات جديدة
        بين الإطارات الأصلية.
      */

      filters.push(
        "minterpolate=" +
        "fps=" + fps +
        ":mi_mode=mci" +
        ":mc_mode=aobmc" +
        ":me_mode=bidir" +
        ":vsbmc=1"
      );

    }


    // ====================================
    // APPLY FILTERS
    // ====================================

    if (filters.length > 0) {

      command = command.videoFilters(filters);

    }


    // ====================================
    // VIDEO / AUDIO
    // ====================================

    command
      .videoCodec("libx264")
      .audioCodec("aac");


    // ====================================
    // OUTPUT SETTINGS
    // ====================================

    const outputOptions = [

      "-pix_fmt",
      "yuv420p",

      "-movflags",
      "+faststart",

      "-b:a",
      "192k",

      /*
        جودة الفيديو.
        CRF أقل = جودة أعلى.
      */

      "-crf",
      "18",

      /*
        preset medium يعطي توازن
        جيد بين الجودة والحجم.
      */

      "-preset",
      "medium",

      /*
        نواة واحدة حتى لا يستهلك
        FFmpeg موارد السيرفر بالكامل.
      */

      "-threads",
      "1"

    ];


    // ====================================
    // OUTPUT FPS
    // ====================================

    outputOptions.push(
      "-r",
      String(fps)
    );


    command = command.outputOptions(outputOptions);


    // ====================================
    // START
    // ====================================

    command.on(
      "start",
      function (commandLine) {

        console.log("");
        console.log("FFmpeg started:");
        console.log(commandLine);
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
          typeof progress.percent === "number"
        ) {

          console.log(
            "Processing:",
            Math.round(progress.percent) + "%"
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
        console.log("================================");
        console.log("PROCESSING COMPLETED");
        console.log("================================");


        if (!fs.existsSync(output)) {

          try {

            if (fs.existsSync(input)) {
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

          if (fs.existsSync(input)) {
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
            encodeURIComponent(outputName)

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
        console.error("================================");
        console.error("FFMPEG ERROR");
        console.error("================================");
        console.error(error);
        console.error("================================");


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


      if (!res.headersSent) {

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
      path.basename(req.params.file);

    const file =
      path.join(outputsDir, filename);


    if (!fs.existsSync(file)) {

      return res.status(404).json({

        success: false,

        error:
          "الفيديو غير موجود"

      });

    }


    res.download(file, filename);

  }
);


// ========================================
// ERROR HANDLER
// ========================================

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
    console.log("================================");
    console.log(
      "Video Enhance running on port " +
      PORT
    );
    console.log("================================");
    console.log("");

  }
);
