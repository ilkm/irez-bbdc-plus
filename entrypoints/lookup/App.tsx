import * as React from 'react';
import { WordDefinition } from '@/components/word-definition';
import { WordbookActions } from '@/components/wordbook-actions';
import { escapeQuotes, HOST } from '@/lib/api';
import { useTheme } from '@/lib/use-theme';
import type { WordLookupResponse, LookupMessage, ResizeMessage, LookupReadyMessage } from '@/lib/types';

interface LookupState {
  word: string;
  data: WordLookupResponse | null;
}

export default function App() {
  useTheme();
  const [lookupState, setLookupState] = React.useState<LookupState | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // 监听来自 content.ts 的消息；挂载后通知父页面可投递，避免 onload 竞态丢消息
  React.useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e.data as LookupMessage;
      if (msg && msg.type === 'lookup') {
        setLookupState({ word: msg.word, data: msg.data });
      }
    };
    window.addEventListener('message', handler);
    const readyMsg: LookupReadyMessage = { type: 'lookup-ready' };
    window.parent.postMessage(readyMsg, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // 发送高度给父窗口 — 测量整页内容高度，父页面据此放大 iframe，尽量避免滚动条
  const sendHeight = React.useCallback(() => {
    requestAnimationFrame(() => {
      const el = rootRef.current;
      if (!el) return;
      // 含 margin（mt）的完整高度
      const styles = window.getComputedStyle(el);
      const mt = parseFloat(styles.marginTop) || 0;
      const mb = parseFloat(styles.marginBottom) || 0;
      const height = Math.ceil(el.getBoundingClientRect().height + mt + mb);
      const resizeMsg: ResizeMessage = { type: 'resize', height };
      window.parent.postMessage(resizeMsg, '*');
    });
  }, []);

  React.useLayoutEffect(() => {
    if (lookupState) {
      const timer = setTimeout(sendHeight, 50);
      return () => clearTimeout(timer);
    }
  }, [lookupState, sendHeight]);

  React.useEffect(() => {
    if (!rootRef.current || !lookupState) return;
    const observer = new ResizeObserver(() => {
      sendHeight();
    });
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [lookupState, sendHeight]);

  if (!lookupState) return null;

  const { data } = lookupState;
  const wordEntry = data?.wordlist?.[0];
  const escapedInterpret = wordEntry ? escapeQuotes(wordEntry.interpret) : '';

  return (
    <div
      ref={rootRef}
      onClick={(e) => e.stopPropagation()}
      className="min-w-[260px] max-w-[400px] w-max font-sans mt-[8px] animate-scale-in"
    >
      <div className="glass-card-solid rounded-2xl overflow-hidden">
        {/* 透明标题栏 */}
        <div className="flex items-center px-3 py-2 border-b border-line bg-titlebar">
          <img
            src="/images/icon_48.png"
            width="18"
            height="18"
            className="mr-2 rounded"
            alt="logo"
          />
          <a href={HOST} target="_blank" className="text-[12px] text-accent font-medium">
            不背单词
          </a>
          {wordEntry && (
            <span className="ml-auto text-[11px]">
              <WordbookActions word={wordEntry.word} info={escapedInterpret} />
            </span>
          )}
        </div>

        {/* 释义内容 */}
        <div className="p-3 text-xs leading-normal text-primary">
          {wordEntry ? (
            <WordDefinition
              word={wordEntry.word}
              ukPron={wordEntry.uk_pron}
              usPron={wordEntry.us_pron}
              interpret={wordEntry.interpret}
            />
          ) : (
            <div className="text-center py-3 text-secondary">
              <span className="text-error font-medium">{lookupState.word}</span> 没有找到
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
