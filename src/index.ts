import { createServer } from './server.ts';

const app = createServer();
// 4310 em vez de 3000/8000: portas comuns que colidem com outros projetos rodando em paralelo.
const port = Number(process.env.PORT ?? 4310);

await app.listen({ port, host: '0.0.0.0' });
console.log(`Server is running on http://0.0.0.0:${port}`);

// curl -X POST -H 'Content-type: application/json' \
//   --data '{"reportType": "meeting"}' localhost:4310/sessions
