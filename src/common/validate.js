// Zod validation middleware factory
import { ZodError } from "zod";

export const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        status: false,
        message: "Validation failed",
        errors: err.errors.map(e => ({ field: e.path.join("."), message: e.message })),
      });
    }
    next(err);
  }
};
