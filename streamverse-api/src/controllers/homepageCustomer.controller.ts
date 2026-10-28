import type { Request, Response } from "express";
import * as homepageService from "../services/homepage.service";
import { sendPaginated } from "../utils/apiResponse";

export async function get(req: Request, res: Response) {
  const { offset, limit } = req.query as unknown as { offset: number; limit: number };
  const { sections, total } = await homepageService.getCustomerHomepage(offset, limit);
  sendPaginated(res, sections, { page: Math.floor(offset / limit) + 1, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }, "Homepage");
}
