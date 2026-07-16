import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WordDefinition } from '@/components/word-definition';
import { WordbookActions } from '@/components/wordbook-actions';
import { fetchWord, checkLogin, escapeQuotes, HOST } from '@/lib/api';
import { parseInput } from '@/lib/text-utils';
import { useTheme } from '@/lib/use-theme';
import { lastSelectedWordItem } from '@/lib/storage';
import type { WordLookupResponse } from '@/lib/types';

export default function App() {
  useTheme();
  const [inputValue, setInputValue] = React.useState('');
  const [tips, setTips] = React.useState<React.ReactNode>('');
  const [loginStatus, setLoginStatus] = React.useState<
    'checking' | 'loggedIn' | 'loggedOut'
  >('checking');
  const [userName, setUserName] = React.useState('');
  const [wordData, setWordData] = React.useState<WordLookupResponse | null>(
    null
  );
  const [escapedInterpret, setEscapedInterpret] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  // 登录状态检查
  React.useEffect(() => {
    inputRef.current?.focus();
    setTips('提示：使用回车键搜索更快捷。');
    (async () => {
      try {
        const resp = await checkLogin();
        if (resp.result_code === 200) {
          setLoginStatus('loggedIn');
          setUserName(resp.data_body.name);
          // 登录成功后通知 background 同步生词本
          browser.runtime.sendMessage({ type: 'sync-wordbook' });
        } else {
          setLoginStatus('loggedOut');
          setTips('提示：使用回车键搜索更快捷。');
        }
      } catch (e) {
        console.log('error', e);
        setLoginStatus('loggedOut');
      }
    })();
  }, []);

  // 查询逻辑
  const handleSearch = async (overrideWord?: string) => {
    const parsed = parseInput(overrideWord ?? inputValue);
    if (parsed === null) {
      setWordData(null);
      setTips(
        <>
          <span className="text-error">英文字符</span>和
          <span className="text-error">空格</span>
          为有效的关键字，请重新输入
        </>
      );
      inputRef.current?.focus();
      return;
    }
    setTips('查询中...');
    setWordData(null);
    try {
      const resp = await fetchWord(parsed);
      if (resp?.wordlist?.length > 0) {
        const entry = resp.wordlist[0];
        setWordData(resp);
        setEscapedInterpret(escapeQuotes(entry.interpret));
        setTips('');
      } else {
        setTips(
          <>
            <span className="text-[1.3em] font-bold text-error">
              {parsed}
            </span>{' '}
            没有找到。
          </>
        );
      }
    } catch (e) {
      console.log('error', e);
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 读取网页选中的单词，自动查询
  React.useEffect(() => {
    (async () => {
      const lastWord = await lastSelectedWordItem.getValue();
      if (lastWord) {
        setInputValue(lastWord);
        lastSelectedWordItem.setValue('');
        handleSearch(lastWord);
      }
    })();
  }, []);

  const wordEntry = wordData?.wordlist?.[0];

  return (
    <div className="w-[340px] app-gradient-bg overflow-hidden text-[13px] font-sans text-primary animate-scale-in">
      {/* 透明标题栏 - 与 lookup 一致 */}
      <div className="flex items-center px-3 py-2 border-b border-line bg-titlebar">
        <img
          src="/images/icon_48.png"
          width="18"
          height="18"
          className="mr-2 rounded"
          alt="logo"
        />
        <a href="https://bbdc.cn" target="_blank" className="text-[12px] text-accent font-medium">
          不背单词
        </a>
        <div className="ml-auto text-[11px]">
          {loginStatus === 'checking' && <span className="text-secondary">正在检查...</span>}
          {loginStatus === 'loggedIn' && (
            <span>
              <a href={`${HOST}/newword`} target="_blank" className="text-accent">
                生词表
              </a>
              <span className="mx-1 text-secondary/40">|</span>
              <a href={HOST} target="_blank" className="text-accent">
                {userName}
              </a>
            </span>
          )}
          {loginStatus === 'loggedOut' && (
            <a
              href={`${HOST}/lexis/login?redirectUrl=http%3A%2F%2Fbbdc.cn%2Fnewword`}
              target="_blank"
              className="text-accent"
            >
              登录
            </a>
          )}
        </div>
      </div>

      {/* 搜索区 */}
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
            autoFocus
            placeholder="输入单词查询..."
          />
          <Button onClick={() => handleSearch()}>查询</Button>
        </div>
        {wordData && wordEntry && (
          <div className="mt-2 animate-fade-in">
            <WordbookActions word={wordEntry.word} info={escapedInterpret} />
          </div>
        )}
      </div>

      {/* 提示 */}
      {tips !== '' && (
        <div className="px-3 pb-2 text-[12px] text-secondary animate-fade-in">
          {tips}
        </div>
      )}

      {/* 释义 */}
      {wordData && wordEntry && (
        <div className="mx-3 mb-3 p-3 glass-card rounded-xl animate-scale-in">
          <WordDefinition
            word={wordEntry.word}
            ukPron={wordEntry.uk_pron}
            usPron={wordEntry.us_pron}
            interpret={wordEntry.interpret}
          />
        </div>
      )}

      {/* 页脚 */}
      <div className="flex items-center justify-end gap-2 px-3 py-2 text-[11px] border-t border-line">
        <a href="/options.html" className="text-secondary hover:text-accent transition-colors">
          设置
        </a>
        <span className="text-secondary/40">|</span>
        <a href="https://bbdc.cn" target="_blank" className="text-secondary hover:text-accent transition-colors">
          关于
        </a>
      </div>
    </div>
  );
}
