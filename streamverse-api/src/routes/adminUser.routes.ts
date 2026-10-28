import { Router } from "express";
import { z } from "zod";
import * as adminUserController from "../controllers/adminUser.controller";
import { validate } from "../middleware/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";

const idParam = z.object({ id: z.string().min(1) });
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
});
const updateBody = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["USER", "ADMIN"]).optional(),
}).strict();

export const adminUserRouter = Router();
adminUserRouter.get("/", validate({ query: listQuery }), asyncHandler(adminUserController.list));
adminUserRouter.get("/:id", validate({ params: idParam }), asyncHandler(adminUserController.getOne));
adminUserRouter.patch("/:id", validate({ params: idParam, body: updateBody }), asyncHandler(adminUserController.update));
adminUserRouter.post("/:id/suspend", validate({ params: idParam }), asyncHandler(adminUserController.suspend));
adminUserRouter.post("/:id/unsuspend", validate({ params: idParam }), asyncHandler(adminUserController.unsuspend));
adminUserRouter.delete("/:id", validate({ params: idParam }), asyncHandler(adminUserController.remove));
