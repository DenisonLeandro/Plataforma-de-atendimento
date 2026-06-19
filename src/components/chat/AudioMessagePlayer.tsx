import { useEffect, useRef, useState } from "react";
import { Play, Pause, Loader2, FileText, ChevronDown, ChevronUp, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface AudioMessagePlayerProps {
  messageId: string;
  conversationId: string;
  mediaUrl: string;
  mimetype?: string | null;
  transcription?: string | null;
  transcriptionStatus?: string | null;
  isFromMe: boolean;
}

const SPEEDS = [1, 1.5, 2] as const;

// Global singleton so only one audio plays at a time
let currentlyPlaying: HTMLAudioElement | null = null;

function fmt(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Fallback for browsers that can't decode the source format (Safari + OGG/Opus):
 * fetch → AudioContext.decodeAudioData → re-encode to WAV → Blob URL.
 */
async function transcodeToWav(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(buf.slice(0));
  ctx.close().catch(() => {});
  const wavBlob = encodeWav(decoded);
  return URL.createObjectURL(wavBlob);
}

function encodeWav(audio: AudioBuffer): Blob {
  const numChannels = audio.numberOfChannels;
  const sampleRate = audio.sampleRate;
  const samples = audio.length;
  const buffer = new ArrayBuffer(44 + samples * numChannels * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples * numChannels * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples * numChannels * 2, true);

  // Interleave
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(audio.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

export const AudioMessagePlayer = ({
  messageId,
  conversationId,
  mediaUrl,
  mimetype,
  transcription,
  transcriptionStatus,
  isFromMe,
}: AudioMessagePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [error, setError] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isRetranscribing, setIsRetranscribing] = useState(false);
  const triedFallbackRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  // Build / rebuild audio element when mediaUrl changes
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = mediaUrl;
    audioRef.current = audio;
    setError(false);
    triedFallbackRef.current = false;

    const onLoaded = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      setIsPlaying(false);
      if (currentlyPlaying === audio) currentlyPlaying = null;
    };
    const onError = async () => {
      if (triedFallbackRef.current) {
        setError(true);
        setIsLoading(false);
        setIsPlaying(false);
        return;
      }
      triedFallbackRef.current = true;
      try {
        setIsLoading(true);
        const wavUrl = await transcodeToWav(mediaUrl);
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = wavUrl;
        audio.src = wavUrl;
        audio.load();
      } catch (e) {
        console.error("[AudioMessagePlayer] fallback transcode failed", e);
        setError(true);
        setIsLoading(false);
        setIsPlaying(false);
      }
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      if (currentlyPlaying === audio) currentlyPlaying = null;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [mediaUrl]);

  // Trigger transcription if missing
  useEffect(() => {
    if (
      mediaUrl &&
      !transcription &&
      (!transcriptionStatus || transcriptionStatus === "failed") &&
      !isRetranscribing
    ) {
      // auto-fire once if never attempted
      if (!transcriptionStatus) {
        triggerTranscription();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl, transcription, transcriptionStatus]);

  const triggerTranscription = async () => {
    setIsRetranscribing(true);
    try {
      const { data, error } = await supabase.functions.invoke("transcribe-audio", {
        body: { messageId },
      });
      const payload = (data ?? {}) as { error?: string; message?: string };
      if (error || payload.error) {
        const msg = payload.message
          || (payload.error === "credits_exhausted"
            ? "Créditos de IA esgotados. Peça ao admin do workspace para aumentar o limite."
            : payload.error === "audio_too_large"
              ? "Áudio muito grande para transcrever."
              : payload.error === "rate_limited"
                ? "Muitas requisições. Tente novamente em alguns segundos."
                : "Não foi possível transcrever este áudio.");
        toast.error(msg);
      }
      await queryClient.invalidateQueries({
        queryKey: ["whatsapp", "messages", conversationId],
      });
    } catch (e) {
      console.error(e);
      toast.error("Falha ao transcrever áudio.");
    } finally {
      setIsRetranscribing(false);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || error) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      if (currentlyPlaying === audio) currentlyPlaying = null;
      return;
    }
    if (currentlyPlaying && currentlyPlaying !== audio) {
      currentlyPlaying.pause();
    }
    try {
      setIsLoading(true);
      audio.playbackRate = SPEEDS[speedIdx];
      await audio.play();
      currentlyPlaying = audio;
      setIsPlaying(true);
    } catch (e) {
      console.error("[AudioMessagePlayer] play failed", e);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className={cn("flex items-center gap-2 text-xs", isFromMe ? "text-primary-foreground/80" : "text-muted-foreground")}>
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Áudio indisponível</span>
      </div>
    );
  }

  const hasTranscript = !!transcription;
  const transcribing = transcriptionStatus === "processing" || isRetranscribing;
  const transcribeFailed = transcriptionStatus === "failed" && !transcription;

  return (
    <div className="space-y-2 min-w-[240px]">
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant={isFromMe ? "secondary" : "default"}
          onClick={togglePlay}
          className="h-9 w-9 rounded-full shrink-0"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4 ml-0.5" />
          )}
        </Button>

        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "h-1.5 rounded-full cursor-pointer relative",
              isFromMe ? "bg-primary-foreground/30" : "bg-muted-foreground/20"
            )}
            onClick={handleSeek}
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isFromMe ? "bg-primary-foreground" : "bg-primary"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className={cn(
              "flex items-center justify-between mt-1 text-[10px]",
              isFromMe ? "text-primary-foreground/70" : "text-muted-foreground"
            )}
          >
            <span>{fmt(currentTime)}{duration ? ` / ${fmt(duration)}` : ""}</span>
            <button
              type="button"
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 font-medium"
              title="Velocidade"
            >
              {SPEEDS[speedIdx]}x
            </button>
          </div>
        </div>
      </div>

      {(hasTranscript || transcribing || transcribeFailed) && (
        <div
          className={cn(
            "rounded-md px-2 py-1.5 text-xs",
            isFromMe ? "bg-primary-foreground/10" : "bg-muted/60"
          )}
        >
          {transcribing && (
            <div className="flex items-center gap-1.5 opacity-80">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Transcrevendo áudio…</span>
            </div>
          )}
          {!transcribing && hasTranscript && (
            <div>
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="flex items-center gap-1.5 font-medium opacity-90 hover:opacity-100"
              >
                <FileText className="w-3 h-3" />
                <span>{showTranscript ? "Ocultar transcrição" : "Ver transcrição"}</span>
                {showTranscript ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showTranscript && (
                <p className="mt-1.5 whitespace-pre-wrap leading-snug opacity-95">
                  {transcription}
                </p>
              )}
            </div>
          )}
          {!transcribing && transcribeFailed && (
            <button
              type="button"
              onClick={triggerTranscription}
              className="flex items-center gap-1.5 opacity-80 hover:opacity-100"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Tentar transcrever novamente</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
