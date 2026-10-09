import { defineConfig } from 'orval';

export default defineConfig({
    Hackathon: {
        input: {
            target: 'http://backend:8000/openapi.json',
        },
        output: {
            target: './src/lib/api/hackathon.ts',
            mode: "tags",
            client: 'react-query',
            baseUrl: 'http://localhost:8000',
        },
        hooks: {
            afterAllFilesWrite: 'prettier --write',
        },
    }
});