import type { Request, Response } from "express";
import * as homepageService from "../services/homepage.service";
import { auditContext } from "../services/auditLog.service";
import { sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";

export async function list(_req: Request, res: Response) {
  sendSuccess(res, await homepageService.listSections(), "Homepage sections");
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await homepageService.createSection(req.body, auditContext(req)), "Section created", 201);
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await homepageService.updateSection(req.params["id"]!, req.body, auditContext(req)), "Section updated");
}
export async function remove(req: Request, res: Response) {
  await homepageService.deleteSection(req.params["id"]!, auditContext(req));
  sendSuccess(res, null, "Section deleted");
}
export async function reorderSections(req: Request, res: Response) {
  await homepageService.reorderSections(req.body, auditContext(req));
  sendSuccess(res, null, "Sections reordered");
}

export async function getItems(req: Request, res: Response) {
  if (!(await homepageService.getSection(req.params["id"]!))) throw new NotFoundError("Homepage section not found");
  sendSuccess(res, await homepageService.listItems(req.params["id"]!), "Items");
}
export async function addItem(req: Request, res: Response) {
  sendSuccess(res, await homepageService.addItem(req.params["id"]!, req.body, auditContext(req)), "Item added", 201);
}
export async function removeItem(req: Request, res: Response) {
  await homepageService.removeItem(req.params["id"]!, req.params["contentId"]!, auditContext(req));
  sendSuccess(res, null, "Item removed");
}
export async function reorderItems(req: Request, res: Response) {
  await homepageService.reorderItems(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, null, "Items reordered");
}
