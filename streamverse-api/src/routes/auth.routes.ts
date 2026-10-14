import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { forgotPasswordLimiter, loginLimiter, refreshLimiter, registerLimiter, resetPasswordLimiter } from "../middleware/rateLimit.middleware";
import { validate } from "../middleware/validate.middleware";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../validators/auth.validator";
import { asyncHandler } from "../utils/asyncHandler";

export const authRouter = Router();

authRouter.post("/register", registerLimiter(), validate({ body: registerSchema }), asyncHandler(authController.register));
authRouter.post("/login", loginLimiter(), validate({ body: loginSchema }), asyncHandler(authController.login));
authRouter.post("/refresh", refreshLimiter(), asyncHandler(authController.refresh));
authRouter.post("/logout", asyncHandler(authController.logout));
authRouter.post("/logout-all", requireAuth, asyncHandler(authController.logoutAll));
authRouter.get("/me", requireAuth, asyncHandler(authController.me));
authRouter.post("/forgot-password", forgotPasswordLimiter(), validate({ body: forgotPasswordSchema }), asyncHandler(authController.forgotPassword));
authRouter.post("/reset-password", resetPasswordLimiter(), validate({ body: resetPasswordSchema }), asyncHandler(authController.resetPassword));
authRouter.post("/change-password", requireAuth, validate({ body: changePasswordSchema }), asyncHandler(authController.changePassword));
