import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import { FiPause, FiPlay, FiRefreshCw, FiX } from 'react-icons/fi';
import type { TransferItem } from '../types/app';

interface Props {
  open: boolean;
  onClose: () => void;
  transfers: TransferItem[];
  onRetry: (id: string) => void | Promise<void>;
  onPause?: (id: string) => void | Promise<void>;
  onResume?: (id: string) => void | Promise<void>;
  onClearCompleted: () => void;
}

function formatDuration(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const s = Math.round(seconds);
  if (s < 5) return 'a few seconds';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${sec}s left`;
  return `${sec}s left`;
}

export default function TransferManager({
  open,
  onClose,
  transfers,
  onRetry,
  onPause,
  onResume,
  onClearCompleted,
}: Props) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 420 } } }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6">Transfers</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <Button size="small" onClick={onClearCompleted}>
            Clear completed
          </Button>
          <IconButton aria-label="Close transfers" onClick={onClose}>
            <FiX />
          </IconButton>
        </Stack>
      </Box>
      <Box sx={{ px: 2, pb: 2, overflow: 'auto' }}>
        {transfers.length === 0 ? (
          <Typography color="text.secondary">No transfers yet.</Typography>
        ) : (
          <List dense>
            {transfers.map((t) => (
              <ListItem
                key={t.id}
                divider
                alignItems="flex-start"
                secondaryAction={
                  t.type === 'upload' && t.status === 'running' ? (
                    <IconButton
                      edge="end"
                      aria-label={`Pause ${t.name}`}
                      onClick={() => onPause?.(t.id)}
                    >
                      <FiPause />
                    </IconButton>
                  ) : t.status === 'paused' ? (
                    <IconButton
                      edge="end"
                      aria-label={`Resume ${t.name}`}
                      onClick={() => onResume?.(t.id)}
                    >
                      <FiPlay />
                    </IconButton>
                  ) : t.status === 'failed' ? (
                    <IconButton
                      edge="end"
                      aria-label={`Retry ${t.name}`}
                      onClick={() => onRetry(t.id)}
                    >
                      <FiRefreshCw />
                    </IconButton>
                  ) : null
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                        {t.name}
                      </Typography>
                      <Chip size="small" label={t.type} />
                      <Chip
                        size="small"
                        color={
                          t.status === 'completed'
                            ? 'success'
                            : t.status === 'failed'
                              ? 'error'
                              : t.status === 'running'
                                ? 'primary'
                                : t.status === 'paused'
                                  ? 'warning'
                                  : 'default'
                        }
                        label={t.status}
                      />
                    </Stack>
                  }
                  secondary={
                    <Box sx={{ mt: 1 }}>
                      {t.targetPath && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          Path: {t.targetPath}
                        </Typography>
                      )}
                      {(t.status === 'running' || t.status === 'queued') && (
                        <LinearProgress
                          variant={t.progress >= 0 ? 'determinate' : 'indeterminate'}
                          value={t.progress >= 0 ? t.progress : undefined}
                          sx={{ mt: 0.5 }}
                        />
                      )}
                      {t.status === 'running' && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.25 }}>
                          {t.progress >= 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {t.progress}%
                            </Typography>
                          )}
                          {t.progress >= 0 && formatDuration(t.etaSeconds) && (
                            <Typography variant="caption" color="text.secondary">
                              • {formatDuration(t.etaSeconds)}
                            </Typography>
                          )}
                          {t.progress < 0 && (
                            <Typography variant="caption" color="text.secondary">
                              Calculating time remaining...
                            </Typography>
                          )}
                        </Stack>
                      )}
                      {t.error && (
                        <Typography variant="caption" color="error" display="block">
                          {t.error}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
}
