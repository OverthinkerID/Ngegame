import type { NgegameBridgeAPI } from '@ngegame/shared';

declare global {
  interface Window {
    ngegameAPI?: NgegameBridgeAPI;
  }
}

export {};
