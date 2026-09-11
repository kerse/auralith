# Auralith

A local, browser-based tool for turning short audio fragments into long spectral textures.

![Auralith](https://img.shields.io/badge/audio-local%20processing-28584c)

## Features

- WAV, MP3, OGG, and M4A input;
- waveform and spectrogram selection;
- time stretch, independent pitch shift, and reverse;
- editable Speed Curve with Bezier handles, pitch-locked preview, and WAV export;
- draft preview and WAV export;
- all processing runs in the browser — audio stays on the user's device and is never uploaded.

## Live app

Open [Auralith on GitHub Pages](https://kerse.github.io/auralith/).

## Local development

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Then open `http://127.0.0.1:4173`.

## Tests

```sh
npm test
npm run test:browser
```

Browser checks require Chrome or Edge. Test audio is generated locally and is not committed to the repository.

## Technology

Vanilla HTML, CSS, and JavaScript with the Web Audio API and Web Workers. FFT and deterministic random utilities are vendored from `@arraypress/paulstretch` under the MIT license; the dependency license is included in `vendor/package/LICENSE`.

## Copyright

© 2026 Kirill Tomilov

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
