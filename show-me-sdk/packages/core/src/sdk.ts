import { EventBus, SDK_EVENTS } from './bus/EventBus';
import { DOMScanner } from './scanner/DOMScanner';
import { CursorEngine } from './cursor/CursorEngine';
import { AgentClient } from './client/AgentClient';
import { JourneyRunner, JourneyConfig, JourneyState } from './journey/JourneyRunner';
import { SpeechInput } from './voice/SpeechInput';
import { ShowMeConfig } from './types';

export class ShowMeSDK {
  private config: ShowMeConfig;
  private eventBus: EventBus;
  public domScanner: DOMScanner;
  public cursorEngine: CursorEngine;
  private agentClient: AgentClient;
  public journey: JourneyRunner;
  public speech: SpeechInput;
  private initialized = false;
  private active = false;

  constructor(config: ShowMeConfig) {
    this.config = config;
    this.eventBus = new EventBus();
    this.domScanner = new DOMScanner(this.eventBus);
    this.cursorEngine = new CursorEngine(this.eventBus, config.cursorStyle);
    this.agentClient = new AgentClient(config.agentEndpoint);
    this.journey = new JourneyRunner(
      this.domScanner,
      this.cursorEngine,
      this.agentClient,
      this.eventBus,
    );
    this.speech = new SpeechInput(this.eventBus);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.cursorEngine.init();
    await this.domScanner.scan();
    this.initialized = true;
    this.eventBus.emit(SDK_EVENTS.INITIALIZED);
  }

  activate(): void {
    if (!this.initialized) throw new Error('SDK not initialized. Call init() first');
    this.active = true;
    this.cursorEngine.show();
    this.eventBus.emit(SDK_EVENTS.ACTIVATED);
  }

  deactivate(): void {
    this.active = false;
    this.cursorEngine.hide();
    this.eventBus.emit(SDK_EVENTS.DEACTIVATED);
  }

  async query(userQuery: string): Promise<any> {
    const elements = this.domScanner.getElements();
    const response = await this.agentClient.query({
      query: userQuery,
      elements: elements.map((e) => ({
        id: e.id, label: e.label, type: e.type, text: e.metadata.text,
      })),
      context: { url: window.location.href, timestamp: Date.now() },
    });

    if (response.success && response.result?.target_id) {
      const target = this.domScanner.getElementById(response.result.target_id);
      if (target) {
        await this.cursorEngine.flyTo(target.element);
        await this.cursorEngine.hover(target.element, response.result.reasoning);
      }
    }
    return response;
  }

  /** Start a multi-step guided journey. The SDK must be initialized first. */
  async startJourney(
    config: JourneyConfig,
    onState?: (state: JourneyState) => void,
  ): Promise<void> {
    if (!this.initialized) await this.init();
    if (!this.active) this.activate();
    if (onState) this.journey.onState(onState);
    await this.journey.start(config);
  }

  cancelJourney(): void {
    this.journey.cancel();
  }

  /** Whether voice input is available in this browser. */
  isVoiceSupported(): boolean {
    return this.speech.isSupported();
  }

  /**
   * Start listening for a spoken question. `onText` fires with interim and final
   * transcripts (isFinal flag); `onEnd` fires when recognition stops.
   * Language defaults to the SDK config language (zh-CN).
   */
  startVoiceInput(
    onText: (text: string, isFinal: boolean) => void,
    onEnd?: () => void,
    onError?: (error: string) => void,
  ): void {
    this.speech.onResult(onText);
    if (onEnd) this.speech.onEnd(onEnd);
    if (onError) this.speech.onError(onError);
    this.speech.start(this.config.language ?? 'zh-CN');
  }

  stopVoiceInput(): void {
    this.speech.stop();
  }

  get isActive(): boolean {
    return this.active;
  }
}
