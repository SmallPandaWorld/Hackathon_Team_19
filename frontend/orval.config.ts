import { defineConfig } from 'orval';

export default defineConfig({
    Hackathon: {
        input: {
            target: 'http://localhost:8000/openapi.json',
        },
        output: {
            target: './src/lib/api/hackathon.ts',
            mode: "tags",
            client: 'react-query',
            baseUrl: '/api',
        },
        hooks: {
            afterAllFilesWrite: 'prettier --write',
        },
    }
});