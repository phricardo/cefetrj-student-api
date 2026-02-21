const Fastify = require("fastify");
const fastifyCookie = require("@fastify/cookie");
const fastifySwagger = require("@fastify/swagger");
const fastifySwaggerUi = require("@fastify/swagger-ui");
const registerLoginRoute = require("./routes/login.route");

async function buildServer() {
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

  await app.register(registerLoginRoute, { prefix: "/api" });

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
  const port = Number(process.env.PORT || 3000);

  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { buildServer };
