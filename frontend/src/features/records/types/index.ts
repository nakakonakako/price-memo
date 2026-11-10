export type PriceUnit = string

export type PriceRecord = {
  id: string
  user_id: string
  folder_id: string
  recorded_at: string
  store_name: string
  price: number
  amount: number
  unit: PriceUnit
  note: string | null
  receipt_item_id: string | null
  label_image_path: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type PriceRecordInput = {
  folder_id: string
  recorded_at: string
  store_name: string
  price: number
  amount: number
  unit: PriceUnit
  note?: string | null
}
