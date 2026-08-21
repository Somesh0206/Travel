import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

// Web Speech API - browser-native, offline capable in Chrome
export default function VoiceInput({ onResult, testId = "voice-btn" }) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      onResult?.(text);
      toast.success(`Heard: "${text}"`);
    };
    rec.onerror = () => toast.error("Voice input failed. Try again.");
    rec.onend = () => setListening(false);
    recRef.current = rec;
  }, [onResult]);

  const toggle = () => {
    const rec = recRef.current;
    if (!rec) {
      toast.error("Voice not supported in this browser");
      return;
    }
    if (listening) { rec.stop(); return; }
    try { rec.start(); setListening(true); }
    catch { /* already started */ }
  };

  return (
    <Button
      type="button"
      variant={listening ? "default" : "outline"}
      size="icon"
      className={"pill-btn " + (listening ? "bg-[#B24CFF] text-white" : "")}
      onClick={toggle}
      aria-label="Voice input"
      title="Speak destination"
      data-testid={testId}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
    </Button>
  );
}
