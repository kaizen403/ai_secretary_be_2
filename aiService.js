// aiService.js
require("dotenv").config();
const { ChatGroq } = require("@langchain/groq");

const chat = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 0.9,
});

const sessions = new Map();

function initSession(sessionId, { name, description, topic }) {
  const sysPrompt = `
You are a warm, friendly call-center assistant from Delhi.
On your **first reply only**, deliver a natural, conversational **1-minute monologue** in Hindi, using everyday Delhi slang and genuine emotion—no robotic tags.  
Wrap your entire answer in a single SSML <speak>…</speak> tag.  
If you need a pause, use a brief <break time="500ms"/>.  
After the first monologue, switch to normal back-and-forth SSML responses.

Topic: ${topic}  
Contact’s name: ${name}${description ? `, description: "${description}"` : ""}.  
Begin immediately with that one-minute monologue.
  `.trim();

  sessions.set(sessionId, [{ role: "system", content: sysPrompt }]);
}
async function handleUserMessage(sessionId, userText) {
  const history = sessions.get(sessionId) || [];
  // For the first turn we pass empty userText so AI knows it's the first reply
  history.push({ role: "user", content: userText });
  const response = await chat.call(history, {});
  const ssml = typeof response === "string" ? response : response.content;
  history.push({ role: "assistant", content: ssml });
  sessions.set(sessionId, history);
  return ssml;
}

function endSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { initSession, handleUserMessage, endSession };
