export const BASE_URL = "https://alunos.cefet-rj.br";

export function capitalizeName(name) {
  if (!name || typeof name !== "string") return "";

  return name
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
