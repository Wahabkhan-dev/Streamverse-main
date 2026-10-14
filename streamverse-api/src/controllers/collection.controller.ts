import type { Request, Response } from "express";
import * as collectionService from "../services/collection.service";
import { auditContext } from "../services/auditLog.service";
import { sendPaginated, sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../utils/errors";

export async function list(req: Request, res: Response) {
  const { rows, pagination } = await collectionService.listCollections(req.query as never);
  sendPaginated(res, rows, pagination);
}
export async function create(req: Request, res: Response) {
  sendSuccess(res, await collectionService.createCollection(req.body, auditContext(req)), "Collection created", 201);
}
export async function getOne(req: Request, res: Response) {
  const collection = await collectionService.getCollection(req.params["id"]!);
  if (!collection) throw new NotFoundError("Collection not found");
  const items = await collectionService.listItems(collection.id);
  sendSuccess(res, { ...collection, items }, "Collection");
}
export async function update(req: Request, res: Response) {
  sendSuccess(res, await collectionService.updateCollection(req.params["id"]!, req.body, auditContext(req)), "Collection updated");
}
export async function remove(req: Request, res: Response) {
  await collectionService.deleteCollection(req.params["id"]!, auditContext(req));
  sendSuccess(res, null, "Collection archived");
}

export async function addItem(req: Request, res: Response) {
  sendSuccess(res, await collectionService.addItem(req.params["id"]!, req.body, auditContext(req)), "Item added", 201);
}
export async function removeItem(req: Request, res: Response) {
  await collectionService.removeItem(req.params["id"]!, req.params["contentId"]!, auditContext(req));
  sendSuccess(res, null, "Item removed");
}
export async function reorderItems(req: Request, res: Response) {
  await collectionService.reorderItems(req.params["id"]!, req.body, auditContext(req));
  sendSuccess(res, null, "Items reordered");
}
