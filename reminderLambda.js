const twilio = require('twilio');
exports.handler = async (event) => {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  for (const record of event.Records) {
    const { phone, message } = JSON.parse(record.body);
    await client.calls.create({
      url: `${process.env.BASE_URL}/twilio/reminder?message=${encodeURIComponent(message)}`,
      to: phone,
      from: process.env.TWILIO_PHONE_NUMBER,
    });
  }
  return {};
};
