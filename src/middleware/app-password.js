import { timingSafeEqual } from 'node:crypto';

const passwordPattern = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

export function hasMonitoringAppPassword(request, env, sys) {
  const configured = env.APP_PASSWORD;
  const provided = request.headers.get('X-App-Password');
  if (typeof configured !== 'string' || configured.length !== 64 || !passwordPattern.test(configured) ||
      configured === env.API_SECRET || configured === sys.jwt_secret ||
      provided?.length !== 64 || !passwordPattern.test(provided)) {
    return false;
  }
  return timingSafeEqual(encoder.encode(configured), encoder.encode(provided));
}
