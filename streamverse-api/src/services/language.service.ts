import * as languageRepository from "../repositories/language.repository";
import type { CreateLanguageInput } from "../validators/language.validator";
import { ConflictError } from "../utils/errors";

export async function createLanguage(input: CreateLanguageInput) {
  if (await languageRepository.findByCode(input.code)) throw new ConflictError(`Language code "${input.code}" already exists.`);
  return languageRepository.create(input);
}

export const listLanguages = languageRepository.list;
