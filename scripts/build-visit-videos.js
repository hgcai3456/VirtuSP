const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ffmpeg = process.env.FFMPEG || path.join(os.tmpdir(), 'virtusp-ffmpeg', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const outDir = path.join(os.tmpdir(), 'virtusp-visits');
const jobPath = path.join(outDir, 'job.json');
const only = process.argv[2] || '';

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'public', 'js', 'roster.js'), 'utf8'), context);

const patients = context.window.ROSTER.filter((patient) => !only || patient.id === only).map((patient) => ({
  id: patient.id,
  name: patient.name,
  age: patient.age,
  diagnosis: patient.diagnosis,
  photo: path.join(root, 'public', patient.photo),
  photoPos: patient.photoPos || 'center 22%',
  patientVoice: patient.voice === 'female' ? 'Microsoft Zira Desktop' : 'Microsoft David Desktop',
  studentVoice: patient.voice === 'female' ? 'Microsoft David Desktop' : 'Microsoft Zira Desktop',
  patientRate: Number(patient.rate) || 0,
  lines: patient.preview || []
}));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(jobPath, JSON.stringify({ out: outDir, patients }));

const rendered = spawnSync('powershell.exe', [
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', path.join(__dirname, 'render-visits.ps1'),
  '-JobPath', jobPath
], { stdio: 'inherit' });

if (rendered.status !== 0) {
  process.exit(rendered.status || 1);
}

function run(args) {
  const result = spawnSync(ffmpeg, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const videoDir = path.join(root, 'public', 'video');
fs.mkdirSync(videoDir, { recursive: true });

patients.forEach((patient) => {
  const dir = path.join(outDir, patient.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
  const beats = Array.isArray(manifest) ? manifest : [manifest];
  const list = [];

  beats.forEach((beat, index) => {
    const seg = path.join(dir, String(index).padStart(2, '0') + '.mp4');
    const frame = ['-y', '-loop', '1', '-framerate', '30', '-i', beat.file];
    if (beat.silent) {
      run(frame.concat([
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=44100',
        '-t', String(beat.seconds || 2.6),
        '-vf', 'scale=1280:720,format=yuv420p',
        '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast', '-crf', '28',
        '-c:a', 'aac', '-ar', '44100', '-ac', '1', '-b:a', '64k',
        '-shortest', seg
      ]));
    } else {
      run(frame.concat([
        '-i', beat.wav,
        '-vf', 'scale=1280:720,format=yuv420p',
        '-c:v', 'libx264', '-tune', 'stillimage', '-preset', 'veryfast', '-crf', '28',
        '-c:a', 'aac', '-ar', '44100', '-ac', '1', '-b:a', '96k',
        '-af', 'apad=pad_dur=0.45',
        '-shortest', seg
      ]));
    }
    list.push("file '" + seg.replace(/\\/g, '/') + "'");
  });

  const listPath = path.join(dir, 'list.txt');
  fs.writeFileSync(listPath, list.join('\n'));
  run([
    '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c', 'copy', '-movflags', '+faststart',
    path.join(videoDir, patient.id + '.mp4')
  ]);
});

console.log('videos written to public/video');
