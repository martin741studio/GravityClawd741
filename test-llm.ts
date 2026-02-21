import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('API Key missing');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

async function run() {
    try {
        const result = await model.generateContent('Hello');
        console.log('Success:', result.response.text());
    } catch (error) {
        console.error('Error:', error);
    }
}

run();
