export interface ScannedElement {
  id: string;
  element: HTMLElement;
  bounds: DOMRect;
  label: string;
  type: 'button' | 'input' | 'link' | 'menu' | 'tab' | 'icon' | 'other';
  metadata: {
    text?: string;
    icon?: string;
    disabled?: boolean;
    ariaLabel?: string;
    role?: string;
  };
}

export interface CursorConfig {
  autoHide?: boolean;
  followMouse?: boolean;
  zIndex?: number;
  offsetX?: number;
  offsetY?: number;
  /** Diameter of the cursor dot in pixels. Default 24. */
  size?: number;
}

export interface QueryRequest {
  query: string;
  elements: Array<{
    id: string;
    label: string;
    type: string;
    text?: string;
  }>;
  context?: Record<string, any>;
}

export interface QueryResponse {
  success: boolean;
  result?: {
    target_id: string;
    confidence: number;
    reasoning: string;
    suggestion?: string;
  };
  error?: string;
  latency_ms?: number;
}

export interface ShowMeConfig {
  agentEndpoint: string;
  language?: 'zh-CN' | 'en-US';
  voiceEnabled?: boolean;
  cursorStyle?: CursorConfig;
  debug?: boolean;
}
