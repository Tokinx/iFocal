// Offscreen document bootstrap
// 监听 background 通过 chrome.runtime.connect 建立的 port，并把消息 dispatch 到 LocalLlmHost
//
// Port 命名：
//   - local-llm:stream:<reqId>  推理请求长连接
//   - local-llm:probe           能力检测单消息往返
//   - local-llm:download        模型下载（带进度回投）
//   - offscreen-keepalive       SW 保活心跳

import {
  normalizeLocalProviderId,
  PORT_NAME_LOCAL_LLM_DOWNLOAD,
  PORT_NAME_LOCAL_LLM_PROBE,
  PORT_NAME_OFFSCREEN_KEEPALIVE,
  parseStreamPortName,
  type LocalLlmDownloadInbound,
  type LocalLlmDownloadOutbound,
  type LocalLlmHostInbound,
  type LocalLlmHostOutbound,
  type LocalLlmProviderId,
} from '@/shared/local-llm-types';
import { downloadModel, handleInbound, probe } from './local-llm-host';

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === PORT_NAME_OFFSCREEN_KEEPALIVE) {
    // keepalive port: 不接收业务消息，仅靠存在感喂活 service worker
    return;
  }

  if (port.name === PORT_NAME_LOCAL_LLM_PROBE) {
    port.onMessage.addListener(async (msg) => {
      const providerId = normalizeLocalProviderId(msg?.providerId) as LocalLlmProviderId;
      try {
        const result = await probe(providerId);
        try { port.postMessage(result); } catch { /* port closed */ }
      } catch (error) {
        try {
          port.postMessage({
            providerId,
            availability: 'probe-failed',
            reason: error instanceof Error ? error.message : String(error),
          });
        } catch { /* port closed */ }
      }
    });
    return;
  }

  if (port.name === PORT_NAME_LOCAL_LLM_DOWNLOAD) {
    const abortController = new AbortController();
    let disconnected = false;
    port.onDisconnect.addListener(() => {
      disconnected = true;
      try { abortController.abort(); } catch { /* ignore */ }
    });
    const post = (msg: LocalLlmDownloadOutbound) => {
      if (disconnected) return;
      try { port.postMessage(msg); } catch { disconnected = true; }
    };
    port.onMessage.addListener(async (message: LocalLlmDownloadInbound) => {
      if (message?.kind !== 'start') return;
      const providerId = normalizeLocalProviderId(message.providerId) as LocalLlmProviderId;
      try {
        await downloadModel(providerId, abortController.signal, (progress) => {
          post({ kind: 'progress', progress });
        });
        post({ kind: 'done' });
      } catch (error) {
        post({ kind: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    });
    return;
  }

  const streamReqId = parseStreamPortName(port.name);
  if (streamReqId) {
    let disconnected = false;
    port.onDisconnect.addListener(() => {
      disconnected = true;
      handleInbound({ kind: 'abort', reqId: streamReqId }, () => { /* port gone */ });
    });

    const post = (msg: LocalLlmHostOutbound) => {
      if (disconnected) return;
      try { port.postMessage(msg); } catch { disconnected = true; }
    };

    port.onMessage.addListener((message: LocalLlmHostInbound) => {
      try {
        handleInbound(message, post);
      } catch (error) {
        post({
          kind: 'error',
          reqId: streamReqId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
});
