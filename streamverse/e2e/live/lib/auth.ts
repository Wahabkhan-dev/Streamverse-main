import { readFileSync } from "node:fs";
import { Api } from "./api";
import { ADMIN_STATE, TOKEN_KEY, USER_STATE } from "./env";

/** Reads the access token out of a saved browser session (the one the UI login produced). */
export function tokenFromState(file: string): string {
  const state = JSON.parse(readFileSync(file, "utf8")) as { origins: Array<{ localStorage: Array<{ name: string; value: string }> }> };
  const entry = state.origins.flatMap((o) => o.localStorage).find((e) => e.name === TOKEN_KEY);
  if (!entry) throw new Error(`no ${TOKEN_KEY} in ${file}`);
  return entry.value;
}

export const asUser = () => new Api(tokenFromState(USER_STATE));
export const asAdmin = () => new Api(tokenFromState(ADMIN_STATE));
