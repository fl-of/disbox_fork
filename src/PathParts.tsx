import React, { useEffect, useState } from 'react';
import { Box, Button } from '@mui/material';

interface PathPart {
  name: string;
  path: string;
}

interface PathPartsProps {
  fileManager: any;
  path: string | null | undefined;
  showDirectory: (path: string) => void | Promise<void>;
}

export default function PathParts({ fileManager, path, showDirectory }: PathPartsProps) {
  const [parts, setParts] = useState<PathPart[]>([{ name: 'Storage', path: '' }]);

  useEffect(() => {
    if (path === null || path === undefined) {
      setParts([]);
      return;
    }

    const nextParts: PathPart[] = [];
    const normalized = String(path).replace(/^\/+|\/+$/g, '');
    if (normalized) {
      const segments = normalized.split('/');
      let current = '';
      for (const segment of segments) {
        current += `/${segment}`;
        nextParts.push({ name: segment, path: current });
      }
    }
    nextParts.unshift({ name: 'Storage', path: '' });
    setParts(nextParts);
  }, [fileManager, path]);

  if (path === null || path === undefined) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', px: 2, py: 0.5 }}>
      {parts.map((part, index) => (
        <React.Fragment key={part.path || 'root'}>
          <Button
            size="small"
            onClick={() => showDirectory(part.path)}
            sx={{ textTransform: 'none', minWidth: 0 }}
          >
            {part.name}
          </Button>
          {index < parts.length - 1 && <span style={{ opacity: 0.6 }}>/</span>}
        </React.Fragment>
      ))}
    </Box>
  );
}
