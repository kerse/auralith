# Auralith

Локальный браузерный инструмент для превращения коротких звуковых фрагментов в длинные спектральные текстуры.

![Auralith](https://img.shields.io/badge/audio-local%20processing-28584c)

## Возможности

- загрузка WAV, MP3, OGG и M4A;
- выделение фрагмента по waveform и спектрограмме;
- time-stretch, независимый pitch shift и reverse;
- черновое прослушивание и экспорт результата в WAV;
- вся обработка выполняется в браузере — исходное аудио не загружается на сервер.

## Открыть приложение

После публикации через GitHub Pages сайт доступен по адресу:

`https://kerse.github.io/auralith/`

## Локальный запуск

Нужен Node.js 22+.

```sh
npm install
npm run dev
```

Откройте `http://127.0.0.1:4173`.

## Проверки

```sh
npm test
npm run test:browser
```

Для браузерных тестов нужны Chrome или Edge. Тестовые аудиофайлы создаются локально и не входят в репозиторий.

## Технологии

Vanilla HTML, CSS и JavaScript, Web Audio API и Web Workers. Для FFT и детерминированного генератора случайных чисел используется код из `@arraypress/paulstretch` (MIT); его лицензия сохранена в `vendor/package/LICENSE`.
