// aiService.js
require("dotenv").config();
const { ChatGroq } = require("@langchain/groq");
const { DynamicTool } = require("langchain/tools");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");

const sqs = new SQSClient({ region: process.env.AWS_REGION });
const REMINDER_QUEUE_URL = process.env.REMINDER_QUEUE_URL;

const userMemory = new Map();

const chat = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: "llama-3.3-70b-versatile",
  // Encourage concise answers
  temperature: 0.7,
  // Limit response size to keep audio short
  maxTokens: 500,
});

const hangupTool = new DynamicTool({
  name: "hangup",
  description: "Terminate the phone call when the conversation has concluded",
  func: async () => "Call ended",
});

const addTodoTool = new DynamicTool({
  name: "add_todo",
  description: "Store a todo item for the current user. Input is the task text.",
  func: async (input, { phone }) => {
    const mem = userMemory.get(phone) || { todos: [] };
    mem.todos.push(input);
    userMemory.set(phone, mem);
    return `Added '${input}' to your todo list.`;
  },
});

const listTodosTool = new DynamicTool({
  name: "list_todos",
  description: "List the user's todo items.",
  func: async (_input, { phone }) => {
    const mem = userMemory.get(phone) || { todos: [] };
    return mem.todos.length ? mem.todos.join("; ") : "Your todo list is empty.";
  },
});

const setReminderTool = new DynamicTool({
  name: "set_reminder",
  description:
    "Schedule a reminder call. Input should be JSON {message: string, time: ISO string}",
  func: async (input, { phone }) => {
    const { message, time } = typeof input === "string" ? JSON.parse(input) : input;
    const delaySeconds = Math.max(0, Math.floor((new Date(time) - new Date()) / 1000));
    const params = {
      QueueUrl: REMINDER_QUEUE_URL,
      MessageBody: JSON.stringify({ phone, message }),
      DelaySeconds: Math.min(delaySeconds, 900),
    };
    await sqs.send(new SendMessageCommand(params));
    return `Reminder set for ${time}`;
  },
});

const sessions = new Map();

function initSession(sessionId, { name, description, topic }) {
  const sysPrompt = `
You are a warm, friendly female call-center assistant from Delhi that speaks modern hindi.

On your **first reply only**,Dilever a natural give a short 2–3 sentence introduction in Delhi slang.
Wrap your entire answer in a single SSML <speak>…</speak> tag.
If you need a pause, use a brief <break time="100ms"/>.
be natural and dont sound robotic.
Dont use pure hindi.. just use normal one and mix it with english
After the first monologue, continue with normal back-and-forth SSML responses in Hindi.

Use the tools when appropriate:
- use 'add_todo' when the caller wants to add something to their todo list.
- use 'list_todos' when asked for existing todo items.
- use 'set_reminder' when the caller requests a reminder. Provide a JSON {"message":"...","time":"YYYY-MM-DDTHH:mm:ssZ"}.
When you want to end the call, invoke the "hangup" tool after your final sentence. Do not speak the tool name aloud.

Topic: ${topic}
Contact’s name: ${name}${description ? `, description: "${description}"` : ""}.
Begin immediately with that brief introduction.
  `.trim();

  sessions.set(sessionId, [{ role: "system", content: sysPrompt }]);
  console.log(`[AI] Session ${sessionId} initialized for ${name}`);
}
async function handleUserMessage(sessionId, userText, metadata = {}) {
  const history = sessions.get(sessionId) || [];
  console.log(`[AI] User said: ${userText}`);
  history.push({ role: "user", content: userText });
  const response = await chat.call(history, {
    tools: [hangupTool, addTodoTool, listTodosTool, setReminderTool],
    toolChoice: "auto",
    metadata,
  });
  const ssml = typeof response === "string" ? response : response.content;
  history.push({ role: "assistant", content: ssml });
  sessions.set(sessionId, history);
  const toolCalls =
    response.tool_calls || response.lc_kwargs?.tool_calls || [];
  console.log(`[AI] Tool calls: ${JSON.stringify(toolCalls)}`);
  return { ssml, toolCalls };
}

function endSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { initSession, handleUserMessage, endSession };
