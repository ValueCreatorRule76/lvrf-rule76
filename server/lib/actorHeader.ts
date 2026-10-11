/**
 * Sign-in P2b — the X-Actor-Person-Id header is off unless asked for.
 *
 * The header names the actor with no proof: whoever sends it is believed.
 * From P2b the session is the only way to act, except where
 * LVRF_ALLOW_ACTOR_HEADER=1 is set OUTSIDE production — the verify
 * scripts, which drive the API with curl against throwaway clones.
 *
 *   LVRF_ALLOW_ACTOR_HEADER   unset, '' or '0' -> off
 *                             '1'              -> on (not in production)
 *                             anything else    -> refuse to start
 *
 * THE STARTUP GUARD. NODE_ENV=production with the flag set to 1 refuses to
 * start rather than ignore the flag: a production .env asking for the
 * header is a mistake to be fixed, not a setting to be quietly overruled.
 * So there is no switch that re-opens the header in production — the way
 * back from P2b is reverting its commit (BUILD_STATUS, "Sign-in P2b").
 *
 * The mode is logged at startup and reported by /api/health as
 * `actor_header`; lvrf-deploy.sh fails unless it is "off".
 */

export type ActorHeaderMode = 'off' | 'on';

export function actorHeaderMode(): ActorHeaderMode {
  const raw = process.env.LVRF_ALLOW_ACTOR_HEADER?.trim() ?? '';
  if (raw !== '' && raw !== '0' && raw !== '1') {
    throw new Error(`LVRF_ALLOW_ACTOR_HEADER must be unset, 0 or 1 (got "${raw}")`);
  }
  if (raw !== '1') return 'off';
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'LVRF_ALLOW_ACTOR_HEADER=1 is refused in production: the session is the only actor there. ' +
      'Remove it from .env.',
    );
  }
  return 'on';
}
