// ttsService.js
const axios = require("axios");
const { Storage } = require("@google-cloud/storage");

const storage = new Storage();
const BUCKET = "kaz_ai";

// Generates speech using the ElevenLabs API and stores the MP3 in GCS
function stripSsml(ssml) {
  return ssml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function synthesizeIndianEnglish(text, filename) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  // Updated API endpoint requires the `/stream` suffix
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

  console.log(`[TTS] Requesting speech for '${filename}'`);

  const payload = {
    text: stripSsml(text),
    // Use the latest multilingual model for best quality
    model_id: "eleven_multilingual_v2",
  };

  const { data } = await axios.post(
    url,
    payload,
    {
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      responseType: "arraybuffer",
    },
  );

  console.log(`[TTS] Received ${data.length} bytes from ElevenLabs`);

  // 2) Upload to GCS
  const objectName = `audio/${filename}.mp3`;
  const file = storage.bucket(BUCKET).file(objectName);
  console.log(`[TTS] Saving audio to ${objectName}`);
  await file.save(data, {
    contentType: "audio/mpeg",
    public: true,
    metadata: { cacheControl: "public, max-age=31536000" },
  });
  console.log(`[TTS] Saved audio to ${objectName}`);

  const publicUrl = `https://storage.googleapis.com/${BUCKET}/${objectName}`;
  console.log(`[TTS] Public URL ${publicUrl}`);
  return publicUrl;
}

module.exports = { synthesizeIndianEnglish };
