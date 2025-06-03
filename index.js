// index.js
require("dotenv").config();
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const twilio = require("twilio");
const { initSession, handleUserMessage, endSession } = require("./aiService");
const { synthesizeHindi } = require("./ttsService");

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
  const url = await synthesizeHindi(text, "test-tts", false);
  res.json({ url });
});

// AI-driven SSML test
app.get("/test-ssml", async (req, res) => {
  const sessionId = "TEST";
  initSession(sessionId, { name: "Test User", description: "Demo" });
  const ssml = await handleUserMessage(sessionId, "");
  const url = await synthesizeHindi(ssml, "test-ssml", true);
  endSession(sessionId);
  res.json({ url });
});

// Twilio voice webhook
// index.js (excerpt – your /twilio/voice handler)
app.post(
  "/twilio/voice",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { SpeDechResult, CallSid, To } = req.body;
    const twiml = new twilio.twiml.VoiceResponse();

    try {
      let content,
        isSsml = false;
      if (!SpeechResult) {
        const contact = await prisma.contact.findUnique({
          where: { phone: To },
        });
        initSession(CallSid, {
          name: contact?.name || "मित्र",
          description: contact?.description || "",
        });
        content = await handleUserMessage(CallSid, "");
        isSsml = true;
      } else {
        content = await handleUserMessage(CallSid, SpeechResult);
        isSsml = content.trim().startsWith("<speak>");
      }

      // Synthesize as before...
      const audioUrl = await synthesizeHindi(
        content,
        `${CallSid}_${SpeechResult ? "resp" : "greet"}`,
        isSsml,
      );

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
      gather.play(audioUrl);
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
// Call completion webhook
app.post(
  "/twilio/status",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    const { CallSid } = req.body;
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
