import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`
        );
        return res.status(400).json({
          success: false,
          message: `Validation failed: ${fieldErrors.join('; ')}`,
          details: fieldErrors,
          error: error.issues,
        });
      }
      return res.status(400).json({
        success: false,
        message: 'Bad Request',
      });
    }
  };
};
