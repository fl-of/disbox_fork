import { FileIcon as ReactFileIcon, defaultStyles } from 'react-file-icon';

interface FileIconProps {
  mimeType?: string | null;
}

function FileIcon({ mimeType }: FileIconProps) {
  let extension: string = (mimeType || '').split('/')[1] || '';
  const type = (mimeType || '').split('/')[0] || '';

  if (extension === 'vnd.openxmlformats-officedocument.wordprocessingml.document') {
    extension = 'docx';
  } else if (extension === 'vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    extension = 'xlsx';
  } else if (extension === 'vnd.openxmlformats-officedocument.presentationml.presentation') {
    extension = 'pptx';
  } else if (extension === 'vnd.ms-excel') {
    extension = 'xls';
  } else if (extension === 'vnd.ms-powerpoint') {
    extension = 'ppt';
  } else if (extension === 'msword') {
    extension = 'doc';
  } else if (extension === 'x-zip-compressed') {
    extension = 'zip';
  } else if (extension === 'x-rar-compressed') {
    extension = 'rar';
  } else if (extension === 'x-7z-compressed') {
    extension = '7z';
  } else if (extension === 'x-tar') {
    extension = 'tar';
  } else if (extension === 'x-msdownload') {
    extension = 'exe';
  } else if (extension === 'x-msdos-program') {
    extension = 'exe';
  } else if (extension === 'x-msi') {
    extension = 'msi';
  } else if (extension === 'x-shockwave-flash') {
    extension = 'swf';
  } else if (extension === 'x-ms-wim') {
    extension = 'wim';
  } else if (extension === 'x-ms-shortcut') {
    extension = 'lnk';
  }

  if (type === 'inode') {
    extension = mimeType || extension;
  }

  if (extension === 'octet-stream') {
    extension = '';
  }

  if (extension === 'inode/directory') {
    extension = 'folder';
  }

  if (extension === 'vnd.discord.folder') {
    extension = 'folder';
  }

  if (mimeType === 'application/pdf') {
    return (
      <div style={{ width: '25px' }}>
        <ReactFileIcon extension="pdf" {...((defaultStyles as any).pdf || {})} />
      </div>
    );
  }

  const style: any = (defaultStyles as any)[extension] || {};

  return (
    <div style={{ width: '25px' }}>
      <ReactFileIcon extension={extension} {...style} />
    </div>
  );
}

export default FileIcon;
