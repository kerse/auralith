import { spawnSync } from 'node:child_process';
import path from 'node:path';
const run = (command, args) => { const r = spawnSync(command, args, { stdio: 'inherit', windowsHide: true }); if (r.error) throw r.error; if (r.status !== 0) throw new Error(`${command}: ${r.status}`); };
run(process.execPath, ['scripts/sound-fixtures.mjs']);
for (const [extension, codec] of [['mp3', 'libmp3lame'], ['ogg', 'libvorbis'], ['m4a', 'aac']]) run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'tmp/fixtures/stereo.wav', '-c:a', codec, `tmp/fixtures/stereo.${extension}`]);
run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '3601', '-c:a', 'pcm_s16le', 'tmp/fixtures/long.wav']);
const voicePath = path.resolve('tmp/fixtures/voice.wav').replaceAll("'", "''");
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `$voiceEngine = New-Object -ComObject SAPI.SpVoice; $voiceStream = New-Object -ComObject SAPI.SpFileStream; $voiceStream.Open('${voicePath}', 3, $false); $voiceEngine.AudioOutputStream = $voiceStream; $null = $voiceEngine.Speak('Inside this sound, there is another world. Listen to the changing texture.'); $voiceStream.Close()`]);
