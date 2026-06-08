"use client";

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, MessageSquare, Monitor, Users, Settings } from 'lucide-react';
import Hero from '@/components/Hero';
import Footer from '@/components/Footer';
import { WebRTCFileTransfer } from '@/components/WebRTCFileTransfer';
import { WebRTCTextImageTransfer } from '@/components/WebRTCTextImageTransfer';
import DesktopShare from '@/components/DesktopShare';
import WeChatGroup from '@/components/WeChatGroup';
import WebRTCSettings from '@/components/WebRTCSettings';
import { WebRTCUnsupportedModal } from '@/components/WebRTCUnsupportedModal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useWebRTCSupport } from '@/hooks/connection';
import { useTabNavigation, TabType } from '@/hooks/ui';
import { useWebRTCConfigSync } from '@/hooks/settings';

export default function HomePage() {
  // WebRTC配置同步
  useWebRTCConfigSync();
  
  // 使用tab导航hook
  const { 
    activeTab, 
    handleTabChange, 
    confirmDialogState,
    closeConfirmDialog
  } = useTabNavigation();
  
  // WebRTC 支持检测
  const {
    webrtcSupport,
    isSupported,
    isChecked,
    showUnsupportedModal,
    closeUnsupportedModal,
    showUnsupportedModalManually,
  } = useWebRTCSupport();


  // 处理Tabs组件的字符串参数
  const handleTabChangeWrapper = (value: string) => {
    // 类型转换并调用实际的处理函数
    handleTabChange(value as TabType);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
      <div className="flex-1">
        <div className="container mx-auto px-4 py-2 sm:py-4 md:py-6">
          {/* Hero Section */}
          <div className="text-center mb-4 sm:mb-6">
            <Hero />
          </div>

        {/* WebRTC 支持检测加载状态 */}
        {!isChecked && (
          <div className="max-w-4xl mx-auto text-center py-8">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-48 mx-auto mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-32 mx-auto"></div>
            </div>
            <p className="mt-4 text-gray-600">正在检测浏览器支持...</p>
          </div>
        )}

        {/* 主要内容 - 只有在检测完成后才显示 */}
        {isChecked && (
          <div className="max-w-4xl mx-auto">
            {/* WebRTC 不支持时的警告横幅 */}
            {!isSupported && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-red-700 font-medium">
                      当前浏览器不支持 WebRTC，功能可能无法正常使用
                    </span>
                  </div>
                  <button
                    onClick={showUnsupportedModalManually}
                    className="text-red-600 hover:text-red-800 text-sm underline"
                  >
                    查看详情
                  </button>
                </div>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={handleTabChangeWrapper} className="w-full">
              {/* Tabs Navigation - 横向布局 */}
              <div className="mb-6">
                <TabsList className="grid w-full grid-cols-5 max-w-3xl mx-auto h-auto bg-white/90 backdrop-blur-sm shadow-lg rounded-xl p-2 border border-slate-200">
                  <TabsTrigger 
                    value="webrtc" 
                    className="flex items-center justify-center space-x-2 px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-slate-50 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:hover:bg-blue-600"
                    disabled={!isSupported}
                  >
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">文件传输</span>
                    <span className="sm:hidden">文件</span>
                    {!isSupported && <span className="text-xs opacity-60">*</span>}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="message" 
                    className="flex items-center justify-center space-x-2 px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-slate-50 data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:hover:bg-emerald-600"
                    disabled={!isSupported}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span className="hidden sm:inline">文本消息</span>
                    <span className="sm:hidden">消息</span>
                    {!isSupported && <span className="text-xs opacity-60">*</span>}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="desktop" 
                    className="flex items-center justify-center space-x-2 px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-slate-50 data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:hover:bg-purple-600"
                    disabled={!isSupported}
                  >
                    <Monitor className="w-4 h-4" />
                    <span className="hidden sm:inline">共享桌面</span>
                    <span className="sm:hidden">桌面</span>
                    {!isSupported && <span className="text-xs opacity-60">*</span>}
                  </TabsTrigger>
                  <TabsTrigger 
                    value="wechat" 
                    className="flex items-center justify-center space-x-2 px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-slate-50 data-[state=active]:bg-green-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:hover:bg-green-600"
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">交流反馈</span>
                    <span className="sm:hidden">QQ群</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="settings" 
                    className="flex items-center justify-center space-x-2 px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 hover:bg-slate-50 data-[state=active]:bg-orange-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:hover:bg-orange-600"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="hidden sm:inline">中继设置</span>
                    <span className="sm:hidden">设置</span>
                  </TabsTrigger>               
                </TabsList>
                
                {/* WebRTC 不支持时的提示 */}
                {!isSupported && (
                  <p className="text-center text-xs text-gray-500 mt-2">
                    * 需要 WebRTC 支持才能使用
                  </p>
                )}
              </div>

              {/* Tab Content */}
              <div>
                <TabsContent value="webrtc" className="mt-0 animate-fade-in-up">
                  <WebRTCFileTransfer />
                </TabsContent>

                <TabsContent value="message" className="mt-0 animate-fade-in-up">
                  <WebRTCTextImageTransfer />
                </TabsContent>

                <TabsContent value="desktop" className="mt-0 animate-fade-in-up">
                  <DesktopShare />
                </TabsContent>

                <TabsContent value="wechat" className="mt-0 animate-fade-in-up">
                  <WeChatGroup />
                </TabsContent>

                <TabsContent value="settings" className="mt-0 animate-fade-in-up">
                  <WebRTCSettings />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        )}
        </div>
      </div>

      {/* 页脚 */}
      <Footer />

      {/* WebRTC 不支持提示模态框 */}
      {webrtcSupport && (
        <WebRTCUnsupportedModal
          isOpen={showUnsupportedModal}
          onClose={closeUnsupportedModal}
          webrtcSupport={webrtcSupport}
        />
      )}

      {/* 自定义确认对话框 */}
      {confirmDialogState && (
        <ConfirmDialog
          isOpen={confirmDialogState.isOpen}
          onClose={closeConfirmDialog}
          onConfirm={confirmDialogState.onConfirm}
          title={confirmDialogState.title}
          message={confirmDialogState.message}
          confirmText={confirmDialogState.confirmText}
          cancelText={confirmDialogState.cancelText}
          type={confirmDialogState.type}
        />
      )}
    </div>
  );
}
