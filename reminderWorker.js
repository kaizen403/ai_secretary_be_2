const { SQSClient, ReceiveMessageCommand, DeleteMessageCommand } = require('@aws-sdk/client-sqs');
const twilio = require('twilio');
require('dotenv').config();

const sqs = new SQSClient({ region: process.env.AWS_REGION });
const queueUrl = process.env.REMINDER_QUEUE_URL;
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const fromNum = process.env.TWILIO_PHONE_NUMBER;
const baseUrl = process.env.BASE_URL;

async function pollQueue() {
  while (true) {
    try {
      const { Messages } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20,
        })
      );
      if (Messages) {
        for (const msg of Messages) {
          const { phone, message } = JSON.parse(msg.Body);
          try {
            await client.calls.create({
              url: `${baseUrl}/twilio/reminder?message=${encodeURIComponent(message)}`,
              to: phone,
              from: fromNum,
            });
            console.log(`[Reminder] Dialed ${phone} for '${message}'`);
          } catch (err) {
            console.error('Failed to place reminder call', err);
          }
          await sqs.send(
            new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: msg.ReceiptHandle })
          );
        }
      }
    } catch (err) {
      console.error('SQS polling error', err);
    }
  }
}

if (require.main === module) pollQueue();

module.exports = { pollQueue };
