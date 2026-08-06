import { minorUnits } from './moneyEffects.js'
export const calculateInvoiceSettlement = ({ invoiceAmount, alreadySettled = '0.00', paymentAmount, interest = '0.00', fees = '0.00' }) => {
  const invoice = minorUnits(invoiceAmount), settled = minorUnits(alreadySettled), payment = minorUnits(paymentAmount), extra = minorUnits(interest) + minorUnits(fees), principal = payment - extra
  if (principal < 0n) throw new Error('Encargos não podem superar o pagamento.'); const remainingBefore = invoice - settled
  if (principal > remainingBefore) return { status: 'under_review', principalMinor: principal.toString(), remainingMinor: remainingBefore.toString(), warnings: ['PAYMENT_EXCEEDS_OPEN_INVOICE'] }
  const remaining = remainingBefore - principal
  return { status: remaining === 0n ? 'settled' : 'partially_settled', principalMinor: principal.toString(), interestMinor: minorUnits(interest).toString(), feeMinor: minorUnits(fees).toString(), remainingMinor: remaining.toString(), createsExpenseMinor: extra.toString() }
}
