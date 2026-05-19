# DOAG Link

Industrial dark PWA for previewing public media links and converting the best available audio to MP3 or WAV.

## Requirements

- Node.js 18+
- `yt-dlp` available on PATH
- `ffmpeg` available on PATH

This machine already has `yt-dlp` and `ffmpeg` installed.

## Run

```powershell
npm start
```

Open:

- Main app: <http://localhost:4173>
- Audio Library PWA: <http://localhost:4173/library/>

## Notes

- Browser downloads go to the device/browser default Downloads location.
- Successful conversions are also copied by the local backend into `~/Downloads/DOAG_library01079854000989`.
- The Audio Library PWA loads that backend library automatically.
- External folders and pen drives can be opened from the library where the browser supports the File System Access API.
- Mobile browsers and iOS limit automatic folder access, Bluetooth pairing, and output-device switching.
- The app can only download public/access-authorized media supported by `yt-dlp`.
- WAV preserves what is available from the source, but cannot improve source quality.
- Users are responsible for following copyright law and each platform's terms.
