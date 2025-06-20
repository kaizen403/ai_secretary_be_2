# AI Call Center Backend

This service provides a simple phone-based assistant that you can call to schedule reminders or add items to your todo list. It supports both inbound calls from a user and outbound calls triggered automatically by reminders or via the `/call` HTTP endpoint.

## Features

- **Inbound calls** – Users dial the Twilio number. The `/twilio/voice` webhook answers using text-to-speech and passes conversation text to the Groq model.
- **Outbound calls** – The `/call` endpoint or the reminder worker uses Twilio to dial the user and connect to the same `/twilio/voice` flow.
- **Todo memory** – Per-phone-number todo lists stored in memory. Tools `add_todo` and `list_todos` are available to the AI.

## Setup

Run `npm install` to install dependencies. Then copy `.env.example` to `.env` and fill in the required credentials:

- Twilio (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- Groq (`GROQ_API_KEY`)
- ElevenLabs (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`)
- AWS region and queue (`AWS_REGION`, `REMINDER_QUEUE_URL`)

Without these values the server and reminder worker will fail to start.

## Configuration


Copy `.env.example` to `.env` and fill in the required credentials. The ElevenLabs text-to-speech integration requires `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to be set or the server will fail to synthesize audio.

## IAM Policy for the Reminder Worker

The local worker polls the SQS queue to deliver scheduled reminder calls. Grant
the worker's IAM role the following permissions on your queue:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:SendMessage"
      ],
      "Resource": "arn:aws:sqs:<region>:<account-id>:<queue-name>"
    }
  ]
}
```

Replace the `Resource` ARN with your queue's ARN so that the worker can
receive, delete, and optionally send messages.
