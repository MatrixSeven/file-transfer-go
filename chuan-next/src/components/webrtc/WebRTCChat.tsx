"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSharedWebRTCManager } from '@/hooks/connection';
import { useChatBusiness, type ChatMessage } from '@/hooks/text-transfer';
import { useURLHandler } from '@/hooks/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast-simple';
import {
  MessageSquare, Image, Send, Copy, Check, Upload,
  X, ImageIcon, Download
} from 'lucide-react';
import RoomInfoDisplay from '@/components/RoomInfoDisplay';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { checkRoomStatus } from '@/lib/room-utils';

// ── 单条消息气泡组件 ──

const ChatBubble: React.FC<{
  message: ChatMessage;
  onPreviewImage?: (url: string) => void;
}> = ({ message, onPreviewImage }) => {
  const [copied, setCopied] = useState(false);
  const isMine = message.sender === 'me';

  const handleCopy = async () => {
    if (message.type !== 'text') return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const timeStr = new Date(message.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} group`}>
      <div
        className={`relative max-w-[80%] sm:max-w-[70%] ${
          isMine
            ? 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white rounded-2xl rounded-br-md'
            : 'bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-bl-md'
        } shadow-sm`}
      >
        {/* 文本消息 */}
        {message.type === 'text' && (
          <div className="px-4 py-2.5 min-w-[60px]">
            <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed font-sans m-0">
              {message.content}
            </pre>
          </div>
        )}

        {/* 图片消息 */}
        {message.type === 'image' && (
          <div className="p-1.5">
            {message.content ? (
              <img
                src={message.content}
                alt={message.fileName || '图片'}
                className="max-w-[280px] max-h-[280px] rounded-xl cursor-pointer hover:opacity-90 transition-opacity object-cover"
                onClick={() => onPreviewImage?.(message.content)}
                loading="lazy"
              />
            ) : (
              <div className="w-[200px] h-[140px] rounded-xl bg-slate-100 flex items-center justify-center">
                <div className="text-center text-slate-400">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 animate-pulse" />
                  <span className="text-xs">接收中...</span>
                </div>
              </div>
            )}
            {message.status === 'sending' && (
              <div className="absolute inset-0 bg-black/10 rounded-xl flex items-center justify-center">
                <div className="bg-white/90 rounded-full px-3 py-1 text-xs text-slate-600 flex items-center gap-1">
                  <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  发送中
                </div>
              </div>
            )}
          </div>
        )}

        {/* 时间 + 操作 */}
        <div
          className={`flex items-center gap-1.5 px-3 pb-1.5 pt-0 ${
            isMine ? 'justify-end' : 'justify-start'
          }`}
        >
          <span className={`text-[10px] ${isMine ? 'text-white/60' : 'text-slate-400'}`}>
            {timeStr}
          </span>
          {message.status === 'failed' && (
            <span className="text-[10px] text-red-400">发送失败</span>
          )}
          {/* 文本复制按钮 */}
          {message.type === 'text' && (
            <button
              onClick={handleCopy}
              className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded ${
                isMine ? 'hover:bg-white/20 text-white/70' : 'hover:bg-slate-100 text-slate-400'
              }`}
              title="复制"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
          {/* 图片保存提示 */}
          {message.type === 'image' && message.content && (
            <button
              onClick={() => onPreviewImage?.(message.content)}
              className={`opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded ${
                isMine ? 'hover:bg-white/20 text-white/70' : 'hover:bg-slate-100 text-slate-400'
              }`}
              title="查看大图"
            >
              <ImageIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 打字指示器 ──

const TypingIndicator: React.FC = () => (
  <div className="flex justify-start">
    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
      <div className="flex items-center space-x-1.5">
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        <span className="text-xs text-slate-400 ml-1">对方正在输入</span>
      </div>
    </div>
  </div>
);

// ── 主组件 ──

export const WebRTCChat: React.FC = () => {
  const { showToast } = useToast();

  // 模式状态
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [inputText, setInputText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasAutoJoinedRef = useRef(false);

  // 连接 + 业务
  const connection = useSharedWebRTCManager();
  const chat = useChatBusiness(connection);

  // URL 参数处理
  const { updateMode, getCurrentRoomCode, clearURLParams } = useURLHandler({
    featureType: 'message',
    onModeChange: setMode,
    onAutoJoinRoom: (code: string) => {
      if (!hasAutoJoinedRef.current) {
        hasAutoJoinedRef.current = true;
        setInputCode(code);
        joinRoom(code);
      }
    },
  });

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  // 新消息时自动滚动
  useEffect(() => {
    scrollToBottom();
  }, [chat.messages, chat.peerTyping, scrollToBottom]);

  // ── 创建房间 ──

  const createRoom = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const response = await fetch('/api/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '创建房间失败');

      const code = data.code;
      setRoomCode(code);
      await connection.connect(code, 'sender');
      showToast(`聊天房间已创建，取件码: ${code}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建房间失败', 'error');
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, connection, showToast]);

  // ── 加入房间 ──

  const joinRoom = useCallback(async (code: string) => {
    const finalCode = code || inputCode;
    if (!finalCode || finalCode.length !== 6 || isJoining) return;

    setIsJoining(true);
    try {
      const result = await checkRoomStatus(finalCode);
      if (!result.success) {
        showToast(result.error || '加入房间失败', 'error');
        return;
      }
      setRoomCode(finalCode);
      await connection.connect(finalCode, 'receiver');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '加入房间失败', 'error');
    } finally {
      setIsJoining(false);
    }
  }, [inputCode, isJoining, connection, showToast]);

  // ── 重新开始 ──

  const restart = useCallback(() => {
    chat.clearMessages();
    connection.disconnect();
    setRoomCode('');
    setInputCode('');
    setInputText('');
    setPreviewImage(null);
    hasAutoJoinedRef.current = false;
    clearURLParams();
  }, [chat, connection, clearURLParams]);

  // ── 发送消息 ──

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || !connection.isPeerConnected) return;
    chat.sendTextMessage(text);
    setInputText('');

    // 重置 textarea 高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputText, connection.isPeerConnected, chat]);

  // ── 文本输入 ──

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    chat.sendTypingStatus();

    // 自动调整高度
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [chat]);

  // ── 键盘快捷键 ──

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ── 图片处理 ──

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('请选择图片文件', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('图片不能超过 5MB', 'error');
      return;
    }
    if (!connection.isPeerConnected) {
      showToast('等待对方加入后才能发送图片', 'error');
      return;
    }
    chat.sendImage(file);
    e.target.value = '';
  }, [connection.isPeerConnected, chat, showToast]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          if (file.size > 5 * 1024 * 1024) {
            showToast('图片不能超过 5MB', 'error');
            return;
          }
          if (!connection.isPeerConnected) {
            showToast('等待对方加入后才能发送图片', 'error');
            return;
          }
          chat.sendImage(file);
        }
        break;
      }
    }
  }, [connection.isPeerConnected, chat, showToast]);

  // ── 复制分享链接 ──

  const copyShareLink = useCallback(() => {
    const baseUrl = window.location.origin + window.location.pathname;
    const link = `${baseUrl}?type=message&mode=receive&code=${roomCode}`;
    navigator.clipboard.writeText(link).then(
      () => showToast('分享链接已复制', 'success'),
      () => showToast('复制失败', 'error'),
    );
  }, [roomCode, showToast]);

  const copyCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode);
    showToast('取件码已复制', 'success');
  }, [roomCode, showToast]);

  const pickupLink = roomCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}?type=message&mode=receive&code=${roomCode}`
    : '';

  // 判断阶段
  const isConnected = connection.isConnected || connection.isPeerConnected;
  const isSetup = !roomCode;

  // ─────────────────────────────────────
  // 渲染
  // ─────────────────────────────────────

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 模式切换 - 与文件传输/桌面共享统一风格 */}
      {isSetup && (
        <div className="flex justify-center mb-6">
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-1 shadow-lg">
            <Button
              variant={mode === 'send' ? 'default' : 'ghost'}
              onClick={() => updateMode('send' as any)}
              className="px-6 py-2 rounded-lg"
            >
              <Upload className="w-4 h-4 mr-2" />
              发送消息
            </Button>
            <Button
              variant={mode === 'receive' ? 'default' : 'ghost'}
              onClick={() => updateMode('receive' as any)}
              className="px-6 py-2 rounded-lg"
            >
              <Download className="w-4 h-4 mr-2" />
              加入房间
            </Button>
          </div>
        </div>
      )}

      {/* ── 阶段 1: 创建/加入房间 ── */}
      {isSetup && (
        <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 shadow-lg border border-white/20 animate-fade-in-up">
          {mode === 'send' ? (
            /* ── 创建房间 ── */
            <div className="space-y-6">
              {/* 功能标题 + 状态栏 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">双向消息</h2>
                    <p className="text-sm text-slate-600">创建房间后双方可以互相发送文字和图片</p>
                  </div>
                </div>
                <ConnectionStatus currentRoom={null} />
              </div>

              <div className="text-center py-8">
                <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-10 h-10 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2">创建聊天房间</h3>
                <p className="text-slate-500 mb-8 text-sm">创建房间后双方可以互相发送文字和图片</p>
                <Button
                  onClick={createRoom}
                  disabled={isCreating || connection.isConnecting}
                  className="px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white text-base font-medium rounded-xl shadow-lg transition-all hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:scale-100"
                >
                  {isCreating || connection.isConnecting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      创建中...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      创建聊天房间
                    </div>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* ── 加入房间 ── */
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                    <Download className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">加入聊天房间</h2>
                    <p className="text-sm text-slate-500">输入 6 位取件码加入房间</p>
                  </div>
                </div>
                <ConnectionStatus currentRoom={null} />
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); joinRoom(inputCode); }}
                className="space-y-4"
              >
                <div className="relative">
                  <Input
                    value={inputCode}
                    onChange={(e) =>
                      setInputCode(
                        e.target.value.replace(
                          /[^123456789ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijklmnpqrstuvwxyz]/g,
                          '',
                        ).toUpperCase(),
                      )
                    }
                    placeholder="请输入取件码"
                    className="text-center text-2xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.5em] font-mono h-12 sm:h-16 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:ring-emerald-500 bg-white/80 backdrop-blur-sm"
                    maxLength={6}
                    disabled={isJoining || connection.isConnecting}
                  />
                  <p className="text-center text-xs text-slate-400 mt-2">
                    {inputCode.length}/6 位
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={inputCode.length !== 6 || isJoining || connection.isConnecting}
                  className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-base font-medium rounded-xl shadow-lg transition-all hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:scale-100"
                >
                  {isJoining || connection.isConnecting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      连接中...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Download className="w-5 h-5" />
                      加入房间
                    </div>
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ── 阶段 2: 房间已创建/加入 ── */}
      {!isSetup && (
        <div className="animate-fade-in-up">
          {!connection.isPeerConnected ? (
            /* ── 等待对方加入: loading + QR 一体卡片 ── */
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 sm:p-6 shadow-lg border border-white/20">
              {/* 标题栏 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">双向消息</h3>
                    <p className="text-sm text-slate-600">房间代码: {roomCode}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <ConnectionStatus
                    currentRoom={{ code: roomCode, role: mode === 'send' ? 'sender' : 'receiver' }}
                  />
                  <Button
                    onClick={restart}
                    variant="outline"
                    className="text-slate-600 hover:text-slate-800 border-slate-200 hover:border-slate-300"
                  >
                    重新开始
                  </Button>
                </div>
              </div>

              {/* Loading 等待 */}
              <div className="flex flex-col items-center py-8 space-y-3">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                  <MessageSquare className="w-8 h-8 text-blue-400" />
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-blue-500">等待对方加入中...</span>
                </div>
                <p className="text-center text-xs text-slate-400">
                  对方加入后即可开始聊天
                </p>
              </div>

              {/* QR / 取件码 - 与 loading 同一卡片内 */}
              {roomCode && mode === 'send' && (
                <div className="pt-4">
                  <RoomInfoDisplay
                    code={roomCode}
                    link={pickupLink}
                    icon={MessageSquare}
                    iconColor="from-blue-500 to-indigo-500"
                    codeColor="from-blue-600 to-indigo-600"
                    title="聊天房间已创建！"
                    subtitle="分享取件码给对方，对方加入后即可开始聊天"
                    codeLabel="取件码"
                    qrLabel="扫码加入"
                    copyButtonText="复制取件码"
                    copyButtonColor="bg-blue-500 hover:bg-blue-600"
                    qrButtonText="使用手机扫码快速加入"
                    linkButtonText="复制链接"
                    onCopyCode={copyCode}
                    onCopyLink={copyShareLink}
                  />
                </div>
              )}
            </div>
          ) : (
            /* ── 已连接: 聊天窗口 ── */
            <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
              {/* 功能标题和状态 */}
              <div className="flex items-center justify-between p-4 sm:px-6 sm:py-4 border-b border-slate-100">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">双向消息</h3>
                    <p className="text-sm text-slate-600">房间代码: {roomCode}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <ConnectionStatus
                    currentRoom={{ code: roomCode, role: mode === 'send' ? 'sender' : 'receiver' }}
                  />
                  <Button
                    onClick={restart}
                    variant="outline"
                    className="text-slate-600 hover:text-slate-800 border-slate-200 hover:border-slate-300"
                  >
                    重新开始
                  </Button>
                </div>
              </div>

              {/* 聊天区域 */}
              <div className="bg-slate-50/50">
                {/* 消息列表 */}
                <div
                  className="h-[400px] sm:h-[480px] overflow-y-auto p-4 space-y-3"
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {chat.messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-4">
                      <MessageSquare className="w-12 h-12 text-slate-300" />
                      <p className="text-center text-sm">
                        连接已建立，开始发送消息吧！
                      </p>
                      <p className="text-center text-xs text-slate-300">
                        双方都可以发送文字和图片
                      </p>
                    </div>
                  ) : (
                    chat.messages.map((msg) => (
                      <ChatBubble
                        key={msg.id}
                        message={msg}
                        onPreviewImage={setPreviewImage}
                      />
                    ))
                  )}

                  {/* 打字指示器 */}
                  {chat.peerTyping && <TypingIndicator />}

                  <div ref={messagesEndRef} />
                </div>

                {/* 输入栏 */}
                <div className="border-t border-slate-200 bg-white p-3">
                  <div className="flex items-end gap-2">
                    {/* 图片按钮 */}
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 p-0 flex-shrink-0 text-slate-500 hover:text-blue-500 hover:bg-blue-50 rounded-xl"
                      title="发送图片"
                    >
                      <Image className="w-5 h-5" />
                    </Button>

                    {/* 文本输入 */}
                    <textarea
                      ref={textareaRef}
                      value={inputText}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      onPaste={handlePaste}
                      placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
                      rows={1}
                      className="flex-1 resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      style={{ minHeight: '40px', maxHeight: '120px' }}
                    />

                    {/* 发送按钮 */}
                    <Button
                      onClick={handleSend}
                      disabled={!inputText.trim()}
                      size="sm"
                      className="h-10 w-10 p-0 flex-shrink-0 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl shadow-md transition-all hover:shadow-lg disabled:opacity-40 disabled:shadow-none"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>

                  <p className="text-[10px] text-slate-400 mt-1.5 ml-12">
                    支持粘贴图片 (Ctrl+V) · 图片最大 5MB
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 图片预览模态框 ── */}
      {previewImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="预览"
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain"
            />
            <Button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 bg-white text-slate-700 hover:bg-slate-100 rounded-full w-8 h-8 p-0 shadow-lg"
              size="sm"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />
    </div>
  );
};
