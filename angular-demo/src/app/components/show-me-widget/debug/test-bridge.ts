/**
 * Dev-only bridge: exposes the ShowMeService on `window.__showMeService` so
 * Chrome DevTools / manual exploration can poke at the running SDK instance
 * (e.g. trigger journeys, inspect state, validate widget wiring).
 *
 * Tree-shaken out of production builds because it is only referenced from
 * a conditional that checks the Angular environment.
 */
import { ShowMeService } from '../../../services/show-me.service';

declare global {
  interface Window {
    __showMeService?: ShowMeService;
  }
}

export function installTestBridge(service: ShowMeService): void {
  if (typeof window === 'undefined') return;
  window.__showMeService = service;
}
