// index.js
require("dotenv").config();
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const twilio = require("twilio");
const { initSession, handleUserMessage, endSession } = require("./aiService");
const { synthesizeIndianEnglish, stripSsml } = require("./ttsService");

const requiredEnv = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "GROQ_API_KEY",
  "BASE_URL",
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[Startup] Missing environment variable ${key}`);
    process.exit(1);
  }
}

if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
  console.warn(
    "[Startup] ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID not set; using Twilio TTS",
  );
}

const app = express();
const prisma = new PrismaClient();
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
const fromNum = process.env.TWILIO_PHONE_NUMBER;
const baseUrl = process.env.BASE_URL;

app.use("/audio", express.static("public/audio"));
app.use(express.json());

// Raw-text TTS test
app.get("/test-tts", async (req, res) => {
  const text =
    req.query.text ||
    "नमस्ते, यह एक पूर्ण परीक्षण संदेश है ताकि आप सुन सकें कि आवाज़ कैसी निकलती है।";
  const url = await synthesizeIndianEnglish(text, "test-tts");
  res.json({ url });
});

// AI-driven SSML test
app.get("/test-ssml", async (req, res) => {
  const sessionId = "TEST";
  initSession(sessionId, { name: "Test User", description: "Demo" });
  const { ssml } = await handleUserMessage(sessionId, "");
  const url = await synthesizeIndianEnglish(ssml, "test-ssml");
  endSession(sessionId);
  res.json({ url });
});

// Twilio voice webhook
// index.js (excerpt – your /twilio/voice handler)
app.post(
  "/twilio/voice",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { SpeechResult, CallSid, To, From } = req.body;
    console.log(`[Voice] CallSid=${CallSid} Speech=${SpeechResult || "<none>"}`);
    console.log(`[Voice] From=${From} To=${To}`);
    const twiml = new twilio.twiml.VoiceResponse();

    try {
      let resp,
        content;
      const userPhone = From === fromNum ? To : From;
      if (!SpeechResult) {
        const contact = await prisma.contact.findUnique({
          where: { phone: To },
        });
        initSession(CallSid, {
          name: contact?.name || "मित्र",
          description: contact?.description || "",
        });
        resp = await handleUserMessage(CallSid, "", { phone: userPhone });
        content = resp.ssml;
      } else {
        resp = await handleUserMessage(CallSid, SpeechResult, { phone: userPhone });
        content = resp.ssml;
      }

      console.log(`[Voice] SSML content: ${content}`);

      const shouldHangup = resp.toolCalls.some((c) => c.name === "hangup");
      console.log(`[Voice] Tool calls: ${JSON.stringify(resp.toolCalls)}`);

      // Synthesize using ElevenLabs if credentials are set
      const audioUrl = await synthesizeIndianEnglish(
        content,
        `${CallSid}_${SpeechResult ? "resp" : "greet"}`,
      );
      if (audioUrl) {
        console.log(`[Voice] Audio URL ${audioUrl}`);
      } else {
        console.log("[Voice] Using Twilio text-to-speech fallback");
      }

      // === NEW: allow barge-in during playback ===
      const gather = twiml.gather({
        input: "speech",
        action: `${baseUrl}/twilio/voice`,
        speechTimeout: "auto",
        language: "hi-IN",
        speechModel: "default",
        bargeIn: true, // <— allow interrupt
      });

      // Play inside the gather so we’re listening while playing
      if (audioUrl) {
        gather.play(audioUrl);
      } else {
        gather.say({ language: "hi-IN" }, stripSsml(content));
      }
      if (shouldHangup) twiml.hangup();
      console.log(`[Voice] TwiML response: ${twiml.toString()}`);
    } catch (err) {
      console.error("TTS/Voice error:", err);
      twiml.say(
        "क्षमा करें, तकनीकी समस्या के कारण कॉल जारी नहीं रख सकता। अलविदा।",
        { language: "hi-IN" },
      );
      twiml.hangup();
    }

  res.type("text/xml").send(twiml.toString());
  },
);

app.post(
  "/twilio/reminder",
  express.urlencoded({ extended: false }),
  (req, res) => {
    const { message } = req.query;
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({ language: "en-US" }, message || "Here is your reminder.");
    twiml.hangup();
    res.type("text/xml").send(twiml.toString());
  },
);
// Call completion webhook
app.post(
  "/twilio/status",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { CallSid } = req.body;
    console.log(`[Status] Call ${CallSid} completed`);
    endSession(CallSid);
    await prisma.call.updateMany({
      where: { twilioSid: CallSid },
      data: { status: "completed" },
    });
    res.sendStatus(200);
  },
);

app.post("/call", async (req, res) => {
  const { name, to, description } = req.body;
  if (!name || !to) {
    return res.status(400).json({ error: "`name` and `to` required" });
  }

  try {
    console.log(`[Call] Outbound call requested to ${to} for ${name}`);
    const contact = await prisma.contact.upsert({
      where: { phone: to },
      update: { name, description },
      create: { name, phone: to, description },
    });

    const call = await client.calls.create({
      url: `${baseUrl}/twilio/voice`,
      to,
      from: fromNum,
      statusCallback: `${baseUrl}/twilio/status`,
      statusCallbackEvent: ["completed"],
    });
    console.log(`[Call] Twilio SID ${call.sid} status ${call.status}`);

    await prisma.call.create({
      data: {
        contactId: contact.id,
        twilioSid: call.sid,
        status: call.status,
        message: "",
      },
    });

    res.json({ sid: call.sid });
  } catch (err) {
    console.error("Error in /call:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Server running on http://localhost:${port}`),
);
