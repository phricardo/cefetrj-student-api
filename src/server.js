import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import { fileURLToPath } from "node:url";
import registerLoginRoute from "./routes/login.route.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(fastifyCookie);

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "CEFET-RJ Student API",
        description: "API para autenticacao e extracao de dados do portal de alunos do CEFET-RJ",
        version: "1.0.0",
      },
      servers: [{ url: "/" }],
      tags: [{ name: "Auth", description: "Operacoes de autenticacao" }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: "/",
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
  });

  await app.register(registerLoginRoute, { prefix: "/api/v1" });

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Healthcheck da API",
        response: {
          200: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
            },
          },
        },
      },
    },
    async () => ({ ok: true })
  );

  return app;
}

async function start() {
  const app = await buildServer();

  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 8080);

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  start();
}

