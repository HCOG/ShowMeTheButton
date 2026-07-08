// Ambient declarations for Web Speech API variants. Some browsers expose
// `webkitSpeechRecognition` only; the rest expose `SpeechRecognition`.
// Without these the only way to access them is `(window as any)`, which
// defeats type checking in show-me.service.ts.

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
