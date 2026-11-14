import { Button } from '@mui/material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { formatSize, getMimeType } from './file-utils';
import FileIcon from './FileIcon';

function formatDateString(dateString: string | number | Date | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString();
}

export default function buildColumns(
  fileManager: any,
  currentAction: string,
  onShareClick: (params: GridRenderCellParams) => void | Promise<void>,
  onDownloadClick: (params: GridRenderCellParams) => void | Promise<void>,
  onDeleteClick: (params: GridRenderCellParams) => void | Promise<void>,
): GridColDef[] {
  return [
    {
      field: 'type',
      headerName: '',
      width: 0,
      renderCell: (params: GridRenderCellParams) => (
        <FileIcon
          mimeType={
            params.row.type === 'directory' ? 'inode/directory' : getMimeType(params.row.name)
          }
        />
      ),
      disableColumnMenu: true,
      sortable: false,
      headerClassName: 'no-width no-seperator',
      cellClassName: 'icon-cell',
    } as GridColDef,
    {
      field: 'name',
      headerName: 'Name',
      width: 470,
      editable: true,
      headerClassName: 'extra-width',
    },
    {
      field: 'created_at',
      headerName: 'Created at',
      type: 'date',
      width: 200,
      valueFormatter: (params: any) => formatDateString(params.value),
    },
    {
      field: 'updated_at',
      headerName: 'Updated at',
      type: 'date',
      width: 200,
      valueFormatter: (params: any) => formatDateString(params.value),
    },
    {
      field: 'size',
      headerName: 'Size',
      width: 150,
      valueFormatter: (params: any) => formatSize(params.value),
    },
    {
      field: 'path',
      headerName: 'Path',
      width: 490,
    },
    {
      field: 'share',
      headerName: 'Share',
      width: 85,
      renderCell: (params: GridRenderCellParams) => (
        <div>
          <Button
            disabled={currentAction !== '' || params.row.type === 'directory'}
            variant="text"
            color="primary"
            onClick={async () => {
              await onShareClick(params);
            }}
          >
            Share
          </Button>
        </div>
      ),
    },
    {
      field: 'download',
      headerName: 'Download',
      width: 130,
      renderCell: (params: GridRenderCellParams) => (
        <div>
          <Button
            disabled={currentAction !== ''}
            variant="text"
            color="primary"
            onClick={async () => {
              await onDownloadClick(params);
            }}
          >
            {params.row.type === 'directory' ? 'Zip' : 'Download'}
          </Button>
        </div>
      ),
    },
    {
      field: 'delete',
      headerName: 'Delete',
      width: 85,
      renderCell: (params: GridRenderCellParams) => (
        <div>
          <Button
            disabled={
              currentAction !== '' ||
              (params.row.type === 'directory' &&
                fileManager.getFile(params.row.path) !== null &&
                Object.keys(fileManager.getChildren(params.row.path)).length > 0)
            }
            variant="text"
            color="error"
            onClick={async () => {
              await onDeleteClick(params);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];
}
