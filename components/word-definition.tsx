import { AudioButton } from "./audio-button";

export interface WordDefinitionProps {
  word: string;
  ukPron: string;
  usPron: string;
  interpret: string;
}

export function WordDefinition({ word, ukPron, usPron, interpret }: WordDefinitionProps) {
  const lines = interpret.split(/\r?\n/);
  return (
    <div className="font-sans">
      <div className="text-[18px] font-semibold text-accent mb-2 tracking-tight">
        {word}
      </div>
      <div className="text-xs leading-[20px] space-y-1">
        <div className="flex items-center gap-1.5 py-[3px]">
          <span className="text-secondary w-[36px] text-[11px]">英音</span>
          <span className="text-primary text-[11px]">/{ukPron}/</span>
          <AudioButton type="UK" word={word} />
        </div>
        <div className="flex items-center gap-1.5 py-[3px]">
          <span className="text-secondary w-[36px] text-[11px]">美音</span>
          <span className="text-primary text-[11px]">/{usPron}/</span>
          <AudioButton type="US" word={word} />
        </div>
        <div className="flex items-start gap-1.5 py-[3px] pt-2 mt-1 border-t border-line">
          <span className="text-secondary w-[36px] text-[11px] shrink-0">释义</span>
          <div className="text-primary">
            {lines.map((line, i) => (
              <p key={i} className="m-0 p-0 pb-[4px] last:pb-0">{line}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
