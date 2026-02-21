import { Tool } from './registry.js';
import fetch from 'node-fetch';

export const getWeatherTool: Tool = {
    name: 'get_weather',
    description: 'Gt the current weather for a specific location. Returns a summary of the condition and temperature.',
    parameters: {
        type: 'object',
        properties: {
            location: {
                type: 'string',
                description: 'The city or location to get weather for (e.g. "Bali", "London").',
            },
        },
        required: ['location'],
    },
    execute: async (args: { location: string }) => {
        try {
            // wttr.in format=j1 returns JSON
            const response = await fetch(`https://wttr.in/${encodeURIComponent(args.location)}?format=j1`);

            if (!response.ok) {
                return `Error fetching weather: ${response.statusText}`;
            }

            const data = await response.json() as any;
            const current = data.current_condition?.[0];

            if (!current) {
                return "Weather data not found for this location.";
            }

            const tempC = current.temp_C;
            const desc = current.weatherDesc?.[0]?.value;
            const humidity = current.humidity;

            return `Current weather in ${args.location}: ${desc}, ${tempC}°C, Humidity ${humidity}%.`;
        } catch (error: any) {
            return `Error: ${error.message}`;
        }
    },
};
