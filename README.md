# AI Call Center Backend

This service provides a simple phone-based assistant that you can call to schedule reminders or add items to your todo list. It supports both inbound calls from a user and outbound calls triggered automatically by reminders or via the `/call` HTTP endpoint.

## Features

- **Inbound calls** – Users dial the Twilio number. The `/twilio/voice` webhook answers using text-to-speech and passes conversation text to the Groq model.
- **Outbound calls** – The `/call` endpoint or the reminder worker uses Twilio to dial the user and connect to the same `/twilio/voice` flow.
- **Todo memory** – Per-phone-number todo lists stored in memory. Tools `add_todo` and `list_todos` are available to the AI.
