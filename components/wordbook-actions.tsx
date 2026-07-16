import * as React from "react";
import { BookPlus, Check, Loader2, ExternalLink } from "lucide-react";
import { addWord, checkLogin, HOST } from "@/lib/api";
import { isWordInWordbook, addWordToLocal } from "@/lib/wordbook-sync";
import { wordbookWordsItem } from "@/lib/storage";

export interface WordbookActionsProps {
  word: string;
  info: string;
}

type WordStatus = "checking" | "canAdd" | "alreadyAdded" | "notLoggedIn" | "adding" | "added";

export function WordbookActions({ word, info }: WordbookActionsProps) {
  const [status, setStatus] = React.useState<WordStatus>("checking");
  const statusRef = React.useRef<WordStatus>("checking");
  statusRef.current = status;

  // 初始检查 + 监听跨页面 storage 变化
  React.useEffect(() => {
    let cancelled = false;

    const checkWord = async () => {
      try {
        const exists = await isWordInWordbook(word);
        if (cancelled) return;
        if (exists) {
          setStatus("alreadyAdded");
          return;
        }
        // 未在本地生词本中，校验登录状态
        try {
          const resp = await checkLogin();
          if (cancelled) return;
          setStatus(resp.result_code === 200 ? "canAdd" : "notLoggedIn");
        } catch {
          if (!cancelled) setStatus("canAdd");
        }
      } catch (e) {
        console.log("[bbdc] wordbook check error:", e);
        if (!cancelled) setStatus("canAdd");
      }
    };

    checkWord();

    // 监听 storage 变化 — 其他页面添加生词时自动刷新
    const unwatch = wordbookWordsItem.watch(() => {
      if (cancelled) return;
      if (statusRef.current === "adding" || statusRef.current === "added") return;
      checkWord();
    });

    return () => {
      cancelled = true;
      unwatch();
    };
  }, [word]);

  const handleAdd = async () => {
    setStatus("adding");
    try {
      await addWord(word, info);
      // API 成功后追加到本地（IndexedDB + chrome.storage.local）
      await addWordToLocal(word, info);
      setStatus("added");
    } catch (e) {
      console.log("[bbdc] addWord error:", e);
      setStatus("notLoggedIn");
    }
  };

  if (status === "checking") return null;

  if (status === "canAdd") {
    return (
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          handleAdd();
        }}
        title="添加到生词本"
        className="inline-flex items-center gap-1 text-[11px] cursor-pointer text-accent hover:text-accent-hover transition-colors"
      >
        <BookPlus className="w-3 h-3" />
        <span>加入生词本</span>
      </a>
    );
  }

  if (status === "adding") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-secondary">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>添加中...</span>
      </span>
    );
  }

  if (status === "added" || status === "alreadyAdded") {
    return (
      <a
        href={`${HOST}/newword`}
        target="_blank"
        title="查看生词本"
        className="inline-flex items-center gap-1 text-[11px] text-success hover:opacity-80 transition-opacity"
      >
        <Check className="w-3 h-3" />
        <span>已加入生词本</span>
      </a>
    );
  }

  // notLoggedIn
  return (
    <a
      href={`${HOST}/newword`}
      target="_blank"
      className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-hover transition-colors"
    >
      <ExternalLink className="w-3 h-3" />
      <span>加入生词本</span>
    </a>
  );
}
