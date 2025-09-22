export type SidebarMessageType = 'bootstrap' | 'capture-page' | 'stream-message';

export interface SidebarBootstrapResponse {
  models: string[];
  defaultFeature: string;
  targetLang: string;
}

export interface SidebarStreamRequest {
  type: 'stream-message';
  feature: string;
  model: string;
  targetLang: string;
  text: string;
}

export interface SidebarCaptureResponse {
  preview: string;
}
