import { EventBus, SDK_EVENTS } from '../bus/EventBus';

/**
 * Thin wrapper over the browser Web Speech API (SpeechRecognition).
 *
 * Voice INPUT only — transcribes the user's spoken question to text so it can
 * be fed into the normal query flow. No backend / cloud dependency: the browser
 * (Chrome/Edge) handles recognition. Supported languages here: zh-CN, en-US.
 */
export type SpeechResultCallback = (text: string, isFinal: boolean) => void;
export type SpeechErrorCallback = (error: string) => void;
export type SpeechEndCallback = () => void;

// The Web Speech API isn't in the standard TS DOM lib under a stable name,
// so we declare the minimal shape we use.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export class SpeechInput {
  private recognition: SpeechRecognitionLike | null = null;
  private listening = false;

  private onResultCb?: SpeechResultCallback;
  private onErrorCb?: SpeechErrorCallback;
  private onEndCb?: SpeechEndCallback;

  constructor(private eventBus?: EventBus) {}

  /** Whether the current browser supports speech recognition. */
  static isSupported(): boolean {
    return getRecognitionCtor() !== null;
  }

  isSupported(): boolean {
    return SpeechInput.isSupported();
  }

  isListening(): boolean {
    return this.listening;
  }

  onResult(cb: SpeechResultCallback): this { this.onResultCb = cb; return this; }
  onError(cb: SpeechErrorCallback): this { this.onErrorCb = cb; return this; }
  onEnd(cb: SpeechEndCallback): this { this.onEndCb = cb; return this; }

  /**
   * Begin listening. Resolves nothing — results arrive via the onResult callback
   * (interim updates with isFinal=false, then a final transcript with isFinal=true).
   */
  start(lang: string = 'zh-CN'): void {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this.onErrorCb?.('speech-recognition-unsupported');
      return;
    }
    if (this.listening) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;       // single utterance per activation
    recognition.interimResults = true;    // live partial transcripts
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.listening = true;
      this.eventBus?.emit(SDK_EVENTS.VOICE_START);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) {
        this.onResultCb?.(interim, false);
      }
      if (final) {
        this.onResultCb?.(final, true);
        this.eventBus?.emit(SDK_EVENTS.VOICE_RESULT, { text: final });
      }
    };

    recognition.onerror = (event: any) => {
      this.onErrorCb?.(event?.error ?? 'speech-recognition-error');
    };

    recognition.onend = () => {
      this.listening = false;
      this.eventBus?.emit(SDK_EVENTS.VOICE_END);
      this.onEndCb?.();
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch (err) {
      // start() throws if called while already running — treat as no-op.
      this.listening = false;
      this.onErrorCb?.(String(err));
    }
  }

  /** Stop listening; the final result (if any) is still delivered via onResult. */
  stop(): void {
    if (this.recognition && this.listening) {
      this.recognition.stop();
    }
  }

  /** Hard-cancel without delivering a final result. */
  abort(): void {
    if (this.recognition) {
      this.recognition.abort();
      this.listening = false;
    }
  }
}
