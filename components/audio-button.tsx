import * as React from "react";
import { Volume2 } from "lucide-react";
import { getAudioUrl } from "@/lib/api";
import type { AudioType } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AudioButtonProps {
  type: AudioType;
  word: string;
  className?: string;
}

export function AudioButton({ type, word, className }: AudioButtonProps) {
  const audioPlayingRef = React.useRef(false);
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const errorTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [hovering, setHovering] = React.useState(false);

  const playAudio = React.useCallback(() => {
    if (audioPlayingRef.current) return;
    audioPlayingRef.current = true;

    // 每次创建新的 Audio 元素（与 1.2.1_0 行为一致）
    const audio = new Audio();
    audio.src = getAudioUrl(type, word);

    audio.onerror = () => {
      audioPlayingRef.current = false;
      setErrorMsg("发音不存在");
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setErrorMsg(null), 3000);
    };

    audio.onended = () => {
      audioPlayingRef.current = false;
    };

    // 安全超时：3秒后自动重置，防止 onended/onerror 都不触发导致锁死
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      audioPlayingRef.current = false;
    }, 3000);

    // 使用 play() 而非 autoplay 属性，返回 Promise 可捕获错误
    audio.play().catch(() => {
      audioPlayingRef.current = false;
    });
  }, [type, word]);

  React.useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  return (
    <span className="inline-flex items-center">
      <Volume2
        className={cn(
          "inline-block w-[16px] h-[16px] cursor-pointer transition-all duration-200",
          "text-secondary hover:text-accent hover:drop-shadow-[0_0_6px_rgba(74,158,255,0.5)]",
          hovering && "text-accent",
          className
        )}
        onClick={playAudio}
        onMouseOver={() => { setHovering(true); playAudio(); }}
        onMouseLeave={() => setHovering(false)}
      />
      {errorMsg && (
        <span className="text-[#ffd175] bg-[rgba(255,200,0,0.1)] border border-[rgba(255,200,0,0.25)] rounded-md px-1.5 py-0.5 text-[10px] ml-1.5">
          {errorMsg}
        </span>
      )}
    </span>
  );
}
