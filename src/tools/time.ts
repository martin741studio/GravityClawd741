import { Tool } from './registry.js';

export const getCurrentTimeTool: Tool = {
    name: 'get_current_time',
    description: 'Get the current time and date.',
    parameters: {
        type: 'object',
        properties: {},
    },
    execute: async () => {
        return new Date().toLocaleString();
    },
};
