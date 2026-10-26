import { routeFromLink } from '../shell';
export function redirectSystemPath({ path }: {path: string; initial: boolean}) {
  const route = routeFromLink(path);
  return route ? '/?route=' + encodeURIComponent(route) : '/';
}
