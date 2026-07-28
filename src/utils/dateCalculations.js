export const padDatePart = (value) => String(value).padStart(2, '0')

export const parseLocalDate = (value) => {
  const [year, month, day] = String(value || '').split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

export const daysInMonth = (year, month) => new Date(year, month, 0).getDate()

export const clampDay = (year, month, day) => Math.min(Math.max(Number(day), 1), daysInMonth(year, month))

export const formatLocalISO = (year, month, day) => `${year}-${padDatePart(month)}-${padDatePart(clampDay(year, month, day))}`

export const advanceMonth = (year, month, offset = 1) => {
  const date = new Date(year, month - 1 + offset, 1)
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}
export const addMonthsSafe = (value, offset) => { const parsed = parseLocalDate(value); if (!parsed) return null; const period = advanceMonth(parsed.year, parsed.month, offset); return formatLocalISO(period.year, period.month, parsed.day) }
export const getMonthYear = (value) => { const parsed = parseLocalDate(value); return parsed ? { month: parsed.month, year: parsed.year } : null }
export const compareFinancialDates = (left, right) => { const a = parseLocalDate(left); const b = parseLocalDate(right); if (!a || !b) return null; return `${a.year}${padDatePart(a.month)}${padDatePart(a.day)}`.localeCompare(`${b.year}${padDatePart(b.month)}${padDatePart(b.day)}`) }
export const formatLocalDate = (value) => { const parsed = parseLocalDate(value); return parsed ? formatLocalISO(parsed.year, parsed.month, parsed.day) : null }

export const toLocalDate = (value) => {
  const parsed = parseLocalDate(value)
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day) : null
}
