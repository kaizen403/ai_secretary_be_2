// aiService.js
require("dotenv").config();
const { ChatGroq } = require("@langchain/groq");
const { DynamicTool } = require("langchain/tools");

const chat = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  temperature: 0.9,
});

const hangupTool = new DynamicTool({
  name: "hangup",
  description: "Terminate the phone call when the conversation has concluded",
  func: async () => "Call ended",
});

const sessions = new Map();

function initSession(sessionId, { name, description, topic }) {
  const sysPrompt = `
You are a warm, friendly call-center assistant from Delhi.
Your entire conversation should be in **Hindi**.
On your **first reply only**, deliver a natural, conversational **1-minute monologue** in Hindi, peppered with everyday Delhi slang and genuine emotion—no robotic tags.
Wrap your entire answer in a single SSML <speak>…</speak> tag.
If you need a pause, use a brief <break time="500ms"/>.
After the first monologue, continue with normal back-and-forth SSML responses in Hindi.

When you want to end the call, invoke the "hangup" tool after your final sentence. Do not speak the tool name aloud.

Topic: ${topic}
Contact’s name: ${name}${description ? `, description: "${description}"` : ""}.
Begin immediately with that one-minute monologue.
  `.trim();

  sessions.set(sessionId, [{ role: "system", content: sysPrompt }]);
}
async function handleUserMessage(sessionId, userText) {
  const history = sessions.get(sessionId) || [];
  history.push({ role: "user", content: userText });
  const response = await chat.call(history, { tools: [hangupTool] });
  const ssml = typeof response === "string" ? response : response.content;
  history.push({ role: "assistant", content: ssml });
  sessions.set(sessionId, history);
  const toolCalls =
    response.tool_calls || response.lc_kwargs?.tool_calls || [];
  return { ssml, toolCalls };
}

function endSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { initSession, handleUserMessage, endSession };
