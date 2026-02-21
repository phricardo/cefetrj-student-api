export const BASE_URL = "https://alunos.cefet-rj.br";

const CAMPUS_BY_SIGLA = {
  MAR: "Unidade Maracana (Sede) - Rio de Janeiro",
  RJ: "Unidade Maracana (Sede) - Rio de Janeiro",
  NF: "UNED Nova Friburgo - Nova Friburgo",
  NI: "UNED Nova Iguacu - Nova Iguacu",
  PET: "UNED Petropolis - Petropolis",
  ITG: "UNED Itaguai - Itaguai",
  VAL: "UNED Valenca - Valenca",
  ANG: "UNED Angra dos Reis - Angra dos Reis",
};

export function capitalizeName(name) {
  if (!name || typeof name !== "string") return "";

  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveCampusFromCourseName(courseName) {
  if (!courseName || typeof courseName !== "string") return null;

  const match = courseName.match(/^\s*([A-Za-z]{2,4})\s*-\s*/);
  if (!match) return null;

  const sigla = match[1].toUpperCase();
  return CAMPUS_BY_SIGLA[sigla] || null;
}
