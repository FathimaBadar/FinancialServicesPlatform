import { defineWidget } from '../../core/manifest';
import { span } from '../../core/grid';
import { InventoryUpload } from './widget';

const widget = defineWidget({
  id: 'inventory.upload',
  version: '1.0.0',
  label: 'Inventory upload',
  description:
    'Upload an inventory list from Excel/CSV or add items one by one, check it in the browser, verify the saved copy and submit it for approval.',
  category: 'Inventory',
  contexts: ['MANUFACTURER', 'DISTRIBUTOR', 'WHOLESALER'],
  requires: ['inventory.view'],
  sources: ['inventory.upload.lists', 'inventory.upload.list.get'],
  commands: [
    'inventory.upload.list.create',
    'inventory.upload.item.add',
    'inventory.upload.item.update',
    'inventory.upload.item.delete',
    'inventory.upload.list.delete',
    'inventory.upload.list.submit',
  ],
  actions: [
    { id: 'upload-list', label: 'Upload list', cell: 'inventory.stock.upload', command: 'inventory.upload.list.create', kind: 'primary' },
    { id: 'add-item', label: 'Add item', cell: 'inventory.stock.upload', command: 'inventory.upload.item.add' },
    { id: 'edit-item', label: 'Edit item', cell: 'inventory.stock.upload', command: 'inventory.upload.item.update' },
    { id: 'delete-item', label: 'Delete item', cell: 'inventory.stock.upload', command: 'inventory.upload.item.delete', kind: 'danger' },
    { id: 'delete-list', label: 'Delete list', cell: 'inventory.stock.upload', command: 'inventory.upload.list.delete', kind: 'danger' },
    { id: 'submit-list', label: 'Confirm and submit', cell: 'inventory.stock.upload', command: 'inventory.upload.list.submit', kind: 'primary' },
  ],
  commandOperations: {
    'inventory.upload.list.create': 'create',
    'inventory.upload.item.add': 'modify',
    'inventory.upload.item.update': 'modify',
    'inventory.upload.item.delete': 'modify',
    'inventory.upload.list.delete': 'modify',
    'inventory.upload.list.submit': 'modify',
  },
  size: { xs: span.xs(4), sm: span.sm(8), md: span.md(12), lg: span.lg(12) },
  hideOn: ['forbidden'],
  render: InventoryUpload,
});

export default widget;
