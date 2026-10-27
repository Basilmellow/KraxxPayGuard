// Offline narration mixer. Requires ffmpeg on PATH or FFMPEG_PATH; never uses cloud speech.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
export function waveDuration(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw Error('Expected RIFF WAV audio.');
  let rate = 0, size = 0;
  for (let p = 12; p + 8 <= bytes.length;) {
    const name = bytes.toString('ascii', p, p + 4), length = bytes.readUInt32LE(p + 4);
    if (p + 8 + length > bytes.length) throw Error('Truncated WAV chunk.');
    if (name === 'fmt ' && length >= 16) rate = bytes.readUInt32LE(p + 16);
    if (name === 'data') size += length;
    p += 8 + length + (length % 2);
  }
  if (!rate || !size) throw Error('WAV has no valid audio duration.');
  return size / rate;
}
export function mixWalkthrough(directory, executable = process.env.FFMPEG_PATH || 'ffmpeg') {
  const recording = JSON.parse(readFileSync(join(directory, 'recording.json'), 'utf8'));
  const input = join(directory, 'payguard-walkthrough.webm');
  const probe = spawnSync(executable, ['-hide_banner', '-i', input], { encoding: 'utf8' });
  const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe.stderr || '');
  if (!duration) throw Error('Could not inspect recording with ffmpeg.');
  const seconds = +duration[1] * 3600 + +duration[2] * 60 + +duration[3];
  if (seconds >= 180) throw Error('Recording exceeds three minutes.');
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input], filters = [], tracks = [], narration = [];
  recording.captions.forEach((caption, i) => {
    const file = join(directory, 'narration', `${String(i).padStart(3, '0')}.wav`);
    if (!existsSync(file)) throw Error('Missing offline narration segment.');
    args.push('-i', file);
    const audioSeconds = waveDuration(readFileSync(file));
    const available = Math.max(0.5, (recording.captions[i + 1]?.atSeconds ?? seconds) - caption.atSeconds - 0.25);
    const speed = Math.max(1, audioSeconds / available);
    if (speed > 2) throw Error('Narration needs a longer scene; refusing rushed speech.');
    const label = `voice${i}`;
    filters.push(`[${i + 1}:a]atempo=${speed.toFixed(5)},adelay=${Math.round(caption.atSeconds * 1000)}:all=1[${label}]`);
    tracks.push(`[${label}]`);
    narration.push({ caption: i, audioSeconds, speed });
  });
  filters.push(`${tracks.join('')}amix=inputs=${tracks.length}:normalize=0,apad[voice]`);
  const output = join(directory, 'payguard-walkthrough-narrated.webm');
  args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[voice]', '-c:v', 'copy', '-c:a', 'libopus', '-t', String(seconds), output);
  const mixed = spawnSync(executable, args, { encoding: 'utf8' });
  if (mixed.status !== 0) throw Error(`Offline narration mix failed: ${(mixed.stderr || 'ffmpeg unavailable').slice(-1200)}`);
  const verified = spawnSync(executable, ['-hide_banner', '-i', output], { encoding: 'utf8' });
  if (!/Audio: opus/.test(verified.stderr || '')) throw Error('Narrated output has no verified Opus audio.');
  writeFileSync(join(directory, 'narration.json'), JSON.stringify({ source: 'OFFLINE_WINDOWS_SPEECH', durationSeconds: seconds,
    output: 'payguard-walkthrough-narrated.webm', narration, noCloudSpeech: true }, null, 2));
  console.log(JSON.stringify({ output, encodedDurationSeconds: seconds, audio: 'opus', noCloudSpeech: true }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { mixWalkthrough(process.argv[2] || 'artifacts/walkthrough'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
