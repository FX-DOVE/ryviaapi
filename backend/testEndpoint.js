import { OpenAI } from 'openai';

const apiKey = process.env.AZURE_OPENAI_API_KEY || '';
const baseURL = process.env.AZURE_OPENAI_ENDPOINT || '';

const client = new OpenAI({
  baseURL,
  apiKey,
});

async function test() {
  if (!apiKey || !baseURL) {
    console.log("Azure OpenAI credentials not configured in environment.");
    return;
  }
  try {
    const res1 = await client.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [{ role: 'user', content: 'Say hello' }],
      max_completion_tokens: 10,
    });
    console.log("Success:", res1.choices[0].message.content);
  } catch (err) {
    console.error("Full error:", err);
  }
}

test();
