import puppeteer from "puppeteer-core";
import { BASE_URL, resolveCampusFromCourseName } from "../util.js";

const MAX_RETRIES = 2;

const CPA_BLOCK_MESSAGE =
  "Login temporariamente indisponivel devido ao periodo de CPA. Tente novamente em alguns dias.";

function isCpaUrl(url) {
  return typeof url === "string" && url.startsWith("https://cpa.cefet-rj.br/");
}

async function extractPnotifyText(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();

    const selectors = [
      ".ui-pnotify-text",
      ".pnotify-text",
      ".alert",
      ".alert-danger",
      "#mensagemErro",
      ".msgErro",
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const text = clean(el?.textContent || "");
      if (text) return text;
    }

    return "";
  });
}

async function extractReportData(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();
    const normalize = (v) =>
      clean(v)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const getByLabel = (labelRegex) => {
      const labels = Array.from(document.querySelectorAll("span.label"));
      for (const label of labels) {
        const labelText = normalize(label.textContent || "");
        if (!labelRegex.test(labelText)) continue;

        const td = label.closest("td, th");
        if (!td) continue;

        const raw = clean(td.textContent || "");
        const labelRaw = clean(label.textContent || "");
        const value = clean(raw.replace(labelRaw, "")).replace(/^[:\-]?\s*/g, "");
        if (value) return value;
      }
      return "";
    };

    return {
      enrollmentPeriod: getByLabel(/^periodo de matricula:?\s*$/i) || null,
      course: getByLabel(/^curso:?\s*$/i) || null,
      currentPeriod: getByLabel(/^periodo atual:?\s*$/i) || null,
    };
  });
}

async function registerLoginRoute(fastify) {
  fastify.post(
    "/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Realiza login no portal de alunos do CEFET-RJ",
        body: {
          type: "object",
          required: ["username", "password"],
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string" },
              data: {
                type: "object",
                properties: {
                  username: { type: "string" },
                  studentId: { type: "string" },
                  enrollmentPeriod: { type: "string", nullable: true },
                  course: { type: "string", nullable: true },
                  currentPeriod: { type: "string", nullable: true },
                  campus: { type: "string", nullable: true },
                },
                additionalProperties: true,
              },
            },
            required: ["token", "data"],
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
          503: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { username, password } = request.body || {};

      if (!username || !password) {
        return reply.status(400).send({ error: "Informe usuario e senha." });
      }

      let browser;

      try {
        browser = await puppeteer.launch({
          headless: "new",
          executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--no-zygote",
            "--single-process",
          ],
        });

        const page = await browser.newPage();
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
        );
        page.setDefaultTimeout(30000);

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
          await page.goto(`${BASE_URL}/aluno/index.action`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

          await page.evaluate(
            async ({ loginUrl, user, pass }) => {
              const body = new URLSearchParams({
                j_username: user,
                j_password: pass,
              }).toString();

              await fetch(loginUrl, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body,
                credentials: "include",
                redirect: "follow",
              });
            },
            {
              loginUrl: `${BASE_URL}/aluno/j_security_check`,
              user: String(username),
              pass: String(password),
            }
          );

          await page.goto(`${BASE_URL}/aluno/index.action`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

          const pnotifyText = await extractPnotifyText(page);
          if (pnotifyText) throw new Error(pnotifyText);

          await page.waitForSelector("#matricula", { timeout: 15000 });

          const studentId = await page.$eval("#matricula", (el) => (el?.value || "").trim());
          if (!studentId) throw new Error("Matricula nao encontrada.");

          const cookies = await page.cookies(`${BASE_URL}/aluno/`);
          const SSO = cookies.find((cookie) => cookie.name === "JSESSIONIDSSO");

          if (!SSO?.value) {
            if (attempt === MAX_RETRIES) throw new Error("Tente novamente mais tarde.");
            continue;
          }

          await page.goto(`${BASE_URL}/aluno/aluno/perfil/perfil.action`, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

          const pnotifyPerfil = await extractPnotifyText(page);
          if (pnotifyPerfil) throw new Error(pnotifyPerfil);

          await page.goto(
            `${BASE_URL}/aluno/aluno/relatorio/relatorios.action?matricula=${encodeURIComponent(studentId)}`,
            {
              waitUntil: "domcontentloaded",
              timeout: 30000,
            }
          );

          if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

          const pnotifyRelatorios = await extractPnotifyText(page);
          if (pnotifyRelatorios) throw new Error(pnotifyRelatorios);

          const reportData = await extractReportData(page);

          return reply.status(200).send({
            token: String(SSO.value),
            data: {
              username: String(username),
              studentId: String(studentId),
              ...reportData,
              campus: resolveCampusFromCourseName(reportData?.course),
            },
          });
        }

        throw new Error("Tente novamente mais tarde.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tente novamente mais tarde.";
        const status = message === CPA_BLOCK_MESSAGE ? 503 : 400;
        return reply.status(status).send({ error: message });
      } finally {
        if (browser) await browser.close();
      }
    }
  );
}

export default registerLoginRoute;
