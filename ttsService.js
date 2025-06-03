// ttsService.js
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");
const { Storage } = require("@google-cloud/storage");

const ttsClient = new TextToSpeechClient();
const storage = new Storage();
const BUCKET = "kaz_ai";

async function synthesizeHindi(textOrSsml, filename, isSsml = false) {
  // 1) TTS request
  const input = isSsml ? { ssml: textOrSsml } : { text: textOrSsml };
  const [response] = await ttsClient.synthesizeSpeech({
    input,
    voice: {
      languageCode: "en-IN",
      name: "en-IN-Standard-E",
      ssmlGender: "FEMALE",
    },
    audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
  });

  // 2) Upload to GCS
  const objectName = `audio/${filename}.mp3`;
  const file = storage.bucket(BUCKET).file(objectName);
  await file.save(response.audioContent, {
    contentType: "audio/mpeg",
    public: true,
    metadata: { cacheControl: "public, max-age=31536000" },
  });

  // 3) Return the public URL via Google’s CDN
  return `https://storage.googleapis.com/${BUCKET}/${objectName}`;
}

module.exports = { synthesizeHindi };
