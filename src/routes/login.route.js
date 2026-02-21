const puppeteer = require("puppeteer");
const { BASE_URL } = require("../util");

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

async function extractProfileData(page) {
  return page.evaluate(() => {
    const clean = (v) => (v || "").replace(/\s+/g, " ").trim();

    // pega "label" (span.label) e retorna o texto logo abaixo no mesmo TD/TH
    const getByLabel = (labelRegex) => {
      const labels = Array.from(document.querySelectorAll("span.label"));
      for (const label of labels) {
        const labelText = clean(label.textContent || "");
        if (!labelRegex.test(labelText)) continue;

        const td = label.closest("td, th");
        if (!td) continue;

        // geralmente vem como: <span class="label">Nome</span><br>VALOR
        const raw = clean(td.textContent || "");
        const value = clean(raw.replace(labelText, "")).replace(/^[:\-]?\s*/g, "");
        if (value) return value;
      }
      return "";
    };

    const matriculaEl = document.querySelector("#matricula");
    const matricula = clean(matriculaEl?.getAttribute("value") || matriculaEl?.value || "");

    const nomeMenu = clean(document.querySelector("#menu button .ui-button-text")?.textContent || "");

    const nome = getByLabel(/^Nome$/i) || nomeMenu;
    const nomeMae = getByLabel(/Nome da M[??a]e/i);
    const nomePai = getByLabel(/Nome da Pai|Nome do Pai/i);
    const nascimento = getByLabel(/Nascimento/i);
    const sexo = getByLabel(/Sexo/i);
    const etnia = getByLabel(/Etnia/i);
    const deficiencia = getByLabel(/Defici[??e]ncia/i);
    const tipoSanguineo = getByLabel(/Tipo Sangu[i??]neo/i);
    const fatorRh = getByLabel(/Fator RH/i);
    const estadoCivil = getByLabel(/Estado Civil/i);
    const paginaPessoal = getByLabel(/P[??a]gina Pessoal/i);

    const nacionalidade = getByLabel(/Nacionalidade/i);
    const estado = getByLabel(/^Estado$/i);
    const naturalidade = getByLabel(/Naturalidade/i);

    // Endere??o (bloco Endere??o)
    const tipoEndereco = getByLabel(/Tipo de endere[??c]o/i);
    const tipoLogradouro = getByLabel(/Tipo de logradouro/i);
    const logradouro = getByLabel(/Logradouro/i);
    const numero = getByLabel(/^N[??u]mero$/i);
    const complemento = getByLabel(/Complemento/i);
    const bairro = getByLabel(/Bairro/i);
    const pais = getByLabel(/Pa[i??]s/i);
    const uf = getByLabel(/\bRJ\b|^RJ$|^UF$/i) || getByLabel(/Estado/i); // fallback leve
    const cidade = getByLabel(/Cidade/i);
    const distrito = getByLabel(/Distrito/i);
    const cep = getByLabel(/\bCEP\b/i);
    const email = getByLabel(/^E-mail$/i) || paginaPessoal;
    const telResidencial = getByLabel(/Tel\. Residencial/i);
    const telCelular = getByLabel(/Tel\. Celular/i);
    const telComercial = getByLabel(/Tel\. Comercial/i);
    const fax = getByLabel(/Fax/i);

    return {
      matricula,
      fullName: nome || null,
      motherName: nomeMae || null,
      fatherName: nomePai || null,
      birthDate: nascimento || null,
      gender: sexo || null,
      ethnicity: etnia || null,
      disability: deficiencia || null,
      bloodType: tipoSanguineo || null,
      rhFactor: fatorRh || null,
      maritalStatus: estadoCivil || null,
      email: paginaPessoal || null,
      nationality: nacionalidade || null,
      state: estado || null,
      placeOfBirth: naturalidade || null,
      // address: {
      //   addressType: tipoEndereco || null,
      //   streetType: tipoLogradouro || null,
      //   street: logradouro || null,
      //   number: numero || null,
      //   complement: complemento || null,
      //   neighborhood: bairro || null,
      //   country: pais || null,
      //   stateCode: uf || null,
      //   city: cidade || null,
      //   district: distrito || null,
      //   zipCode: cep || null,
      //   email: email || null,
      //   homePhone: telResidencial || null,
      //   mobilePhone: telCelular || null,
      //   workPhone: telComercial || null,
      //   fax: fax || null,
      // },
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
            password: { type: "string" }
          }
        },
        response: {
          200: {
            type: "object",
            properties: {
              status: {
                type: "object",
                properties: {
                  ok: { type: "boolean" }
                }
              },
              data: {
                type: "object",
                properties: {
                  username: { type: "string" },
                  matricula: { type: "string", nullable: true }
                },
                additionalProperties: true
              }
            }
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" }
            }
          },
          503: {
            type: "object",
            properties: {
              error: { type: "string" }
            }
          }
        }
      }
    },
    async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.status(400).send({ error: "Informe usuario e senha." });
    }

    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      );
      page.setDefaultTimeout(30000);

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        // 1) Abre index
        await page.goto(`${BASE_URL}/aluno/index.action`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

        // 2) Login
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

        // 3) Vai para index logado
        await page.goto(`${BASE_URL}/aluno/index.action`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

        // 4) Erros de UI
        const pnotifyText = await extractPnotifyText(page);
        if (pnotifyText) throw new Error(pnotifyText);

        // 5) Pega matr??cula na index
        await page.waitForSelector("#matricula", { timeout: 15000 });

        const matricula = await page.$eval("#matricula", (el) => (el?.value || "").trim());
        if (!matricula) throw new Error("Matr??cula n??o encontrada.");

        // 6) Cookies SSO
        const cookies = await page.cookies(`${BASE_URL}/aluno/`);
        const SSO = cookies.find((cookie) => cookie.name === "JSESSIONIDSSO");

        if (!SSO?.value) {
          if (attempt === MAX_RETRIES) throw new Error("Tente novamente mais tarde.");
          continue;
        }

        // 7) Agora abre a p??gina de perfil (dados cadastrais)
        await page.goto(`${BASE_URL}/aluno/aluno/perfil/perfil.action`, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        if (isCpaUrl(page.url())) throw new Error(CPA_BLOCK_MESSAGE);

        const pnotifyPerfil = await extractPnotifyText(page);
        if (pnotifyPerfil) throw new Error(pnotifyPerfil);

        // 8) Extrai dados do perfil
        const profile = await extractProfileData(page);

        // garantia: se por algum motivo vier vazio, mant??m a matr??cula que voc?? j?? tem
        profile.matricula = profile.matricula || matricula;

        // 9) Set-Cookie pro seu dom??nio
        reply.setCookie("CEFETID_SSO", SSO.value, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          path: "/",
        });

        // 10) Retorna JSON
        return reply.status(200).send({
          status: { ok: true },
          data: {
            username: String(username),
            ...profile,
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
  });
}

module.exports = registerLoginRoute;
