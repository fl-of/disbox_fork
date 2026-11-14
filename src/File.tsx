import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { Helmet } from 'react-helmet-async';
import { useLocation, useSearchParams } from 'react-router-dom';
import pako from 'pako';
import './App.css';
import { downloadFromAttachmentUrls } from './disbox-file-manager';
import { formatSize, getMimeType, pickLocationAsWritable } from './file-utils';
import NavigationBar from './NavigationBar';

function decodeAttachmentUrls(searchParams: URLSearchParams, hash: string): string[] {
  if (searchParams.get('attachmentUrls')) {
    let base64AttachmentUrls = searchParams.get('attachmentUrls') || '';
    base64AttachmentUrls = base64AttachmentUrls
      .replace(/~/g, '+')
      .replace(/_/g, '/')
      .replace(/-/g, '=');
    return JSON.parse(atob(base64AttachmentUrls));
  }

  const raw = (hash || '')
    .replace(/^#/, '')
    .replace(/~/g, '+')
    .replace(/_/g, '/')
    .replace(/-/g, '=');
  const base64AttachmentUrls = atob(raw);
  const u8Array = new Uint8Array(base64AttachmentUrls.length);
  for (let i = 0; i < base64AttachmentUrls.length; i++) {
    u8Array[i] = base64AttachmentUrls.charCodeAt(i);
  }
  const attachmentUrls = pako.inflate(u8Array, { to: 'string' }) as string;
  return JSON.parse(attachmentUrls);
}

function FilePage() {
  const [searchParams] = useSearchParams();
  const locationData = useLocation();
  const [progress, setProgress] = useState(-1);
  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const fileName = searchParams.get('name') || '';
  const size = Number(searchParams.get('size') || 0);
  const hasPayload = Boolean(fileName && (searchParams.get('attachmentUrls') || locationData.hash));

  const attachmentUrls = useMemo(() => {
    if (!hasPayload) return null;
    try {
      return decodeAttachmentUrls(searchParams, locationData.hash);
    } catch (e: any) {
      return { __error: e?.message || String(e) } as any;
    }
  }, [hasPayload, locationData.hash, searchParams]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const onProgress = (value: number, total: number) => {
    if (!total || total <= 0) {
      setProgress(0);
      return;
    }
    setProgress(Math.max(0, Math.min(100, Math.round((value / total) * 100))));
  };

  const handleDownload = async () => {
    if (!Array.isArray(attachmentUrls)) return;
    try {
      setError('');
      const writable = await pickLocationAsWritable(fileName);
      setDownloading(true);
      setProgress(0);
      await downloadFromAttachmentUrls(attachmentUrls, writable, onProgress, size);
      setProgress(100);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setDownloading(false);
    }
  };

  const handlePreview = async () => {
    if (!Array.isArray(attachmentUrls)) return;
    const mime = getMimeType(fileName);
    if (!(
      mime.startsWith('image/') ||
      mime.startsWith('video/') ||
      mime.startsWith('audio/') ||
      mime === 'application/pdf' ||
      mime.startsWith('text/') ||
      mime === 'application/json'
    )) {
      setError('Preview is not available for this file type.');
      return;
    }
    if (size > 25 * 1024 * 1024) {
      setError('Preview is disabled for files larger than 25 MB.');
      return;
    }
    try {
      setError('');
      setPreviewLoading(true);
      const chunks: Blob[] = [];
      const writable = {
        write: async (blob: Blob) => {
          chunks.push(blob);
        },
        close: async () => {},
      };
      await downloadFromAttachmentUrls(attachmentUrls, writable, null, size);
      const blob = new Blob(chunks, { type: mime || 'application/octet-stream' });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', window.location.href);
    }
  };

  if (!hasPayload) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <NavigationBar />
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Alert severity="error">Invalid or incomplete share link.</Alert>
        </Container>
      </Box>
    );
  }

  if (attachmentUrls && (attachmentUrls as any).__error) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <NavigationBar />
        <Container maxWidth="sm" sx={{ py: 8 }}>
          <Alert severity="error">
            This share link could not be read: {(attachmentUrls as any).__error}
          </Alert>
        </Container>
      </Box>
    );
  }

  const mime = getMimeType(fileName);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Helmet>
        <title>{fileName} - Disbox</title>
        <meta name="description" content="Shared file from Disbox" />
      </Helmet>
      <NavigationBar />
      <Container maxWidth="md" sx={{ py: { xs: 3, md: 6 } }}>
        <Paper sx={{ p: { xs: 2, md: 4 } }} elevation={3}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h4" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                {fileName}
              </Typography>
              <Typography color="text.secondary">
                {formatSize(size)}
                {mime ? ` • ${mime}` : ''}
              </Typography>
            </Box>

            <Alert severity="info">
              This file is shared via Discord attachment links. Links may expire over time; if
              download fails, ask the owner to generate a new share link.
            </Alert>

            {error && <Alert severity="error">{error}</Alert>}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                onClick={handleDownload}
                disabled={downloading || !Array.isArray(attachmentUrls)}
              >
                {downloading ? 'Downloading...' : 'Download'}
              </Button>
              <Button
                variant="outlined"
                onClick={handlePreview}
                disabled={previewLoading || !Array.isArray(attachmentUrls)}
              >
                {previewLoading ? 'Loading preview...' : 'Preview'}
              </Button>
              <Button variant="text" onClick={handleCopyLink}>
                {copied ? 'Link copied' : 'Copy share link'}
              </Button>
            </Stack>

            {(downloading || progress >= 0) && (
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {downloading
                    ? `Downloading: ${progress}%`
                    : progress === 100
                      ? 'Download complete.'
                      : ''}
                </Typography>
                {downloading && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={18} />
                    <Typography variant="body2">{progress}%</Typography>
                  </Box>
                )}
              </Box>
            )}

            {previewUrl && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                  Preview
                </Typography>
                {mime.startsWith('image/') && (
                  <img
                    src={previewUrl}
                    alt={fileName}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '70vh',
                      objectFit: 'contain',
                      borderRadius: 8,
                    }}
                  />
                )}
                {mime.startsWith('video/') && (
                  <video src={previewUrl} controls style={{ width: '100%', maxHeight: '70vh' }} />
                )}
                {mime.startsWith('audio/') && (
                  <audio src={previewUrl} controls style={{ width: '100%' }} />
                )}
                {mime === 'application/pdf' && (
                  <iframe
                    title="PDF preview"
                    src={previewUrl}
                    style={{ width: '100%', height: '70vh', border: 0 }}
                  />
                )}
                {(mime.startsWith('text/') || mime === 'application/json') && (
                  <iframe
                    title="Text preview"
                    src={previewUrl}
                    style={{
                      width: '100%',
                      height: '60vh',
                      border: '1px solid rgba(128,128,128,0.3)',
                    }}
                  />
                )}
              </Box>
            )}
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

export default FilePage;
