const Fastify = require("fastify");
const fastifyCookie = require("@fastify/cookie");
const registerLoginRoute = require("./routes/login.route");

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(fastifyCookie);
  await app.register(registerLoginRoute, { prefix: "/api" });

  app.get("/health", async () => ({ ok: true }));

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

