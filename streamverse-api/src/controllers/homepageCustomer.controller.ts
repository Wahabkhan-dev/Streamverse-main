import type { Request, Response } from "express";
import * as homepageService from "../services/homepage.service";
import { sendSuccess } from "../utils/apiResponse";

export async function get(_req: Request, res: Response) {
  sendSuccess(res, await homepageService.getCustomerHomepage(), "Homepage");
}
