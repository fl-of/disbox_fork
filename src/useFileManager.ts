import { useCallback, useEffect, useRef, useState } from 'react';
import DisboxFileManager from './disbox-file-manager';

let cachedManager: DisboxFileManager | null = null;
let cachedPromise: Promise<DisboxFileManager | null> | null = null;
let cachedWebhookUrl: string | null = null;

export function getWebhookUrl(): string | null {
  return localStorage.getItem('webhookUrl');
}

export function clearFileManager(): void {
  cachedManager = null;
  cachedPromise = null;
  cachedWebhookUrl = null;
}

export function loadFileManager(force = false): Promise<DisboxFileManager | null> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return Promise.resolve(null);
  }
  if (!force && cachedManager && cachedWebhookUrl === webhookUrl) {
    return Promise.resolve(cachedManager);
  }
  if (!force && cachedPromise && cachedWebhookUrl === webhookUrl) {
    return cachedPromise;
  }

  cachedWebhookUrl = webhookUrl;
  cachedPromise = DisboxFileManager.create(webhookUrl)
    .then((manager) => {
      cachedManager = manager;
      return manager;
    })
    .catch((error) => {
      cachedManager = null;
      cachedPromise = null;
      cachedWebhookUrl = null;
      throw error;
    });

  return cachedPromise;
}

export default function useFileManager() {
  const [state, setState] = useState<{ fileManager: DisboxFileManager | null; loading: boolean; error: any }>(() => (
    cachedManager
      ? { fileManager: cachedManager, loading: false, error: null }
      : { fileManager: null, loading: true, error: null }
  ));
  const mounted = useRef(true);

  const load = useCallback(async (force = false) => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const fileManager = await loadFileManager(force);
      if (!mounted.current) {
        return fileManager;
      }
      setState({ fileManager, loading: false, error: null });
      return fileManager;
    } catch (error) {
      if (mounted.current) {
        setState({ fileManager: null, loading: false, error });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!cachedManager) {
      void load(false);
    }
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { ...state, reload: load };
}
