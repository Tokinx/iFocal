export type SidebarMessageType = 'bootstrap' | 'capture-page';

export interface SidebarBootstrapResponse {
  models: string[];
  defaultFeature: string;
  targetLang: string;
}

// 非流式：已移除 SidebarStreamRequest

export interface SidebarCaptureResponse {
  preview: string;
}
