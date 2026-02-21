import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config({ override: true });

async function test() {
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('Testing Key:', apiKey ? apiKey.substring(0, 10) + '...' + apiKey.substring(apiKey.length - 10) : 'NONE');

    try {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        const data: any = await response.json();
        if (data.error) {
            console.error('Error:', data.error);
        } else {
            console.log('Success! Models found:', data.data.length);
        }
    } catch (error) {
        console.error('Fetch Error:', error);
    }
}

test();
