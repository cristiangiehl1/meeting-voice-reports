import { createServer } from './server.ts';

const app = createServer();
const port = Number(process.env.PORT ?? 3000);

await app.listen({ port, host: '0.0.0.0' });
console.log(`Server is running on http://0.0.0.0:${port}`);

// curl -X POST -H 'Content-type: application/json' \
//   --data '{"reportType": "meeting"}' localhost:3000/sessions
