import express from 'express';
import multer from 'multer';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 10000;
const ROOT = path.join(__dirname, 'jobs');
fs.mkdirSync(ROOT, { recursive: true });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  dest: path.join(ROOT, 'uploads'),
  limits: { fileSize: 500 * 1024 * 1024 }
});

const jobs = new Map();

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

app.post('/api/jobs', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع فيديو.' });

  const id = randomUUID();
  const jobDir = path.join(ROOT, id);
  fs.mkdirSync(jobDir, { recursive: true });
  const input = path.join(jobDir, safeFileName(req.file.originalname || 'input.mp4'));
  const output = path.join(jobDir, 'output.mp4');
  fs.renameSync(req.file.path, input);

  const width = req.body.resolution === '1920x1080' ? 1920 : 3840;
  const height = req.body.resolution === '1920x1080' ? 1080 : 2160;
  const fps = req.body.fps === '30' ? 30 : 60;

  jobs.set(id, { id, status: 'queued', progress: 0, output, createdAt: Date.now() });
  processVideo({ id, input, output, width, height, fps });
  res.json({ id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'المهمة غير موجودة.' });
  res.json({ id: job.id, status: job.status, progress: job.progress, error: job.error || null,
    downloadUrl: job.status === 'done' ? `/api/jobs/${job.id}/download` : null });
});

app.get('/api/jobs/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'done' || !fs.existsSync(job.output)) return res.status(404).send('الملف غير جاهز.');
  res.download(job.output, 'video-enhanced-4k-60fps.mp4');
});

function processVideo({ id, input, output, width, height, fps }) {
  const job = jobs.get(id);
  job.status = 'processing';

  // scale: upscale to 4K; minterpolate: create intermediate frames for smoother motion.
  const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
  const args = ['-y', '-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output];
  const ffmpeg = spawn('ffmpeg', args);
  let stderr = '';
  ffmpeg.stderr.on('data', data => {
    stderr += data.toString();
    const match = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/g);
    if (match) job.progress = Math.min(95, job.progress + 1);
  });
  ffmpeg.on('error', err => { job.status = 'error'; job.error = 'تعذر تشغيل FFmpeg: ' + err.message; });
  ffmpeg.on('close', code => {
    if (code === 0 && fs.existsSync(output)) { job.status = 'done'; job.progress = 100; }
    else { job.status = 'error'; job.error = 'فشلت معالجة الفيديو. تأكد من صيغة الملف وحجمه.'; }
    try { fs.unlinkSync(input); } catch {}
  });
}

app.listen(PORT, () => console.log(`VideoEnhance server listening on ${PORT}`));
