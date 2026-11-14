import { Autocomplete, TextField } from '@mui/material';
import { SyntheticEvent, useEffect, useState } from 'react';

interface SearchBarProps {
  fileManager: any;
  files?: boolean;
  directories?: boolean;
  rows: any[];
  advanced?: boolean;
  search?: boolean;
  placeholder?: string;
  onSelect?: (value: string | null) => void;
  onEnter?: (value?: string | null) => void;
  onOptionsChanged?: (options: string[]) => void;
  onChange?: (value: string) => void;
}

function SearchBar({
  fileManager,
  files = true,
  directories = true,
  rows,
  advanced = true,
  search = true,
  placeholder = 'Search',
  onSelect,
  onEnter,
  onOptionsChanged,
  onChange,
}: SearchBarProps) {
  const [baseOptions, setBaseOptions] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<string[]>([]);
  const [byExtension, setByExtension] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!fileManager) {
      setOptions([]);
      setBaseOptions(new Set());
      setByExtension({});
      return;
    }

    const allOptions: string[] = [];
    const byExt: Record<string, string[]> = {};

    const queue: any[] = [''];
    while (queue.length > 0) {
      const current = queue.pop();
      const children = fileManager.getChildren(typeof current === 'string' ? current : (current.path || ''));
      Object.values(children).forEach((f: any) => {
        if (f.type === 'directory') {
          queue.push(f);
          if (directories) {
            allOptions.push(f.path);
          }
        } else if (f.type === 'file') {
          if (files) {
            allOptions.push(f.path);
          }
          if (advanced) {
            const parts = String(f.name || '').split('.');
            const extension = parts.length > 1 ? String(parts.pop()).toLowerCase() : '';
            if (extension) {
              if (!byExt[extension]) {
                byExt[extension] = [];
              }
              byExt[extension].push(f.path);
            }
          }
        }
      });
    }

    setOptions(allOptions);
    setBaseOptions(new Set(allOptions));
    setByExtension(byExt);
  }, [fileManager, rows, files, directories, advanced]);

  const setAutoCompleteOptions = (_event: SyntheticEvent | null, value: string) => {
    const input = value || '';
    let newOptions: string[] = [];
    const parts = input.split(' ').filter(Boolean);
    const advancedParts: string[] = [];
    const textParts: string[] = [];

    parts.forEach((part) => {
      if (part.startsWith('ext:')) {
        advancedParts.push(part);
      } else {
        textParts.push(part);
      }
    });

    let advancedOptions: Set<string> | null = null;
    advancedParts.forEach((part) => {
      if (advanced) {
        const type = part.split(':')[1]?.toLowerCase();
        if (type && byExtension[type]) {
          if (advancedOptions === null) {
            advancedOptions = new Set(byExtension[type]);
          } else {
            advancedOptions = new Set([...advancedOptions].filter((p) => byExtension[type].includes(p)));
          }
        }
      }
    });

    const candidateOptions = advancedOptions === null ? [...baseOptions] : [...advancedOptions];
    if (textParts.length === 0) {
      newOptions = candidateOptions;
    } else {
      for (const option of candidateOptions) {
        const lower = option.toLowerCase();
        if (textParts.every((part) => lower.includes(part.toLowerCase()))) {
          newOptions.push(option);
        }
      }
    }

    if (input && baseOptions.has(input)) {
      newOptions.unshift(input);
    }

    newOptions = [...new Set(newOptions)];
    setOptions(newOptions);
    onOptionsChanged?.(newOptions);
  };

  return (
    <Autocomplete
      freeSolo={search}
      clearIcon={null}
      renderInput={(params) => (
        <TextField
          {...params}
          label={placeholder}
          InputProps={{
            ...params.InputProps,
            type: 'search',
          }}
        />
      )}
      filterOptions={(x) => x}
      onInputChange={(event, value) => {
        setAutoCompleteOptions(event, value);
        onChange?.(value);
      }}
      onChange={(event, value) => {
        const v = typeof value === 'string' ? value : (value as string | null);
        setAutoCompleteOptions(event, v || '');
        onChange?.(v || '');
        onSelect?.(v);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && onEnter) {
          onEnter();
        }
      }}
      options={options}
    />
  );
}

export default SearchBar;
