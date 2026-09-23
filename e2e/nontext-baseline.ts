/** Empty is the target: new or worsened non-text findings fail the gate. */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {}