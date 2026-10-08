import { FolderTrendPanel } from '@/features/trends/components/FolderTrendPanel'
import type { PriceRecord } from '@/features/records/types'

const SAMPLE_FOLDER_ID = 'guide-sample-folder'

function sample(
  n: number,
  recordedAt: string,
  store: string,
  price: number,
  amount: number,
): PriceRecord {
  return {
    id: `guide-sample-${n}`,
    user_id: 'guide-sample-user',
    folder_id: SAMPLE_FOLDER_ID,
    recorded_at: recordedAt,
    store_name: store,
    price,
    amount,
    unit: 'g',
    note: null,
    receipt_item_id: null,
    label_image_path: null,
    sort_order: n,
    created_at: `${recordedAt}T00:00:00Z`,
    updated_at: `${recordedAt}T00:00:00Z`,
  }
}

/** Fixed local fixture. Passing `records` makes FolderTrendPanel skip listRecords. */
const SAMPLE_RECORDS: PriceRecord[] = [
  sample(1, '2026-01-10', 'イオン', 358, 500),
  sample(2, '2026-01-24', 'コープ', 398, 500),
  sample(3, '2026-02-07', '業務スーパー', 598, 1000),
  sample(4, '2026-02-21', 'イオン', 338, 500),
  sample(5, '2026-03-02', 'コープ', 378, 500),
  sample(6, '2026-03-14', 'イオン', 328, 500),
  sample(7, '2026-03-28', '業務スーパー', 548, 1000),
]

export function GuideTrendSample() {
  return (
    <FolderTrendPanel
      folderId={SAMPLE_FOLDER_ID}
      folderName="鶏むね肉"
      records={SAMPLE_RECORDS}
      recordsLoading={false}
      compact
    />
  )
}
