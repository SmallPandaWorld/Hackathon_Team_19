import { defineConfig } from 'orval';

export default defineConfig({
    Hackathon: {
        input: {
            target: 'http://127.0.0.1:8000/openapi.json',
            validation: false,
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