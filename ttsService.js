// ttsService.js
const axios = require("axios");
const { Storage } = require("@google-cloud/storage");

const storage = new Storage();
const BUCKET = "kaz_ai";

// Generates speech using the ElevenLabs API and stores the MP3 in GCS
async function synthesizeIndianEnglish(text, filename) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const { data } = await axios.post(
    url,
    { text },
    {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    },
  );

  // 2) Upload to GCS
  const objectName = `audio/${filename}.mp3`;
  const file = storage.bucket(BUCKET).file(objectName);
  await file.save(data, {
    contentType: "audio/mpeg",
    public: true,
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  // 3) Return the public URL via Google’s CDN
  return `https://storage.googleapis.com/${BUCKET}/${objectName}`;
}

module.exports = { synthesizeIndianEnglish };
