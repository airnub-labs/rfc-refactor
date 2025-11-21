/**
 * Aspect type - middleware pattern for wrapping function calls
 */
export type Aspect<Req, Res> = (
  req: Req,
  next: (req: Req) => Promise<Res>
) => Promise<Res>;

/**
 * Apply a chain of aspects to a base function.
 * Aspects are applied in order: first aspect is outermost, last is innermost.
 */
export function applyAspects<Req, Res>(
  base: (req: Req) => Promise<Res>,
  aspects: Aspect<Req, Res>[]
): (req: Req) => Promise<Res> {
  return aspects.reduceRight<(req: Req) => Promise<Res>>(
    (next, aspect) => (req: Req) => aspect(req, next),
    base
  );
}
