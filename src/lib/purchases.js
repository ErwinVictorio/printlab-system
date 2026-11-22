import { supabase } from './supabase'

export async function purchaseAction(body) {
  const result = await supabase.functions.invoke('purchases', { body })
  if (result.error) {
    const payload = await result.error.context?.json?.().catch(() => null)
    throw new Error(payload?.error || 'Could not reach the purchase service. Please try again.')
  }
  return result.data
}

export const purchaseColumns = 'id,buyer_id,status,total_centavos,payment_type,recipient,qr_path,reference_number,created_at,submitted_at,purchase_items(id,original_id,file_name,event_title,price_centavos)'

export const purchaseStatus = {
  awaiting_payment: 'Awaiting reference',
  pending_verification: 'Pending verification',
  approved: 'Approved',
  rejected: 'Rejected',
}

