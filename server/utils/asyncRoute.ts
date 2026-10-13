import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 4 ne capture pas les rejets des handlers async : une promesse rejetée
 * (ex. EISDIR/EACCES sur une écriture) laissait la requête sans réponse.
 * Ce wrapper transmet le rejet à `next(err)` → gestionnaire d'erreurs global.
 */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
