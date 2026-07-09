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

// ── Ask-user payload (LLM-driven disambiguation) ───────────────────────────

/** One option in an ask-user prompt. */
export interface AskUserOption {
  /** Stable id; the answer is sent back to the agent as `{ id: choice }`. */
  id: string;
  label: string;
  description?: string;
  /** Optional prerequisite markers shown as chips ("Have you prepared the dataset?"). */
  prerequisites?: string[];
}

/** A generic question the LLM wants the user to answer before continuing. */
export interface AskUserPayload {
  /** The actual question shown to the user. */
  question: string;
  /** Optional helper text explaining why the LLM is asking. */
  context?: string;
  options: AskUserOption[];
  /** UI selection mode. Default 'single' (radio buttons). */
  selection?: 'single' | 'multi';
  /** 'option' (default) renders the options above; 'text' shows a free-form input. */
  kind?: 'option' | 'text';
  /** Placeholder for the free-form input (only when kind === 'text'). */
  textPlaceholder?: string;
  /** Whether the user can skip without answering. Default true. */
  skippable?: boolean;
}
