export function isPasswordValid(pw) {
  if (!pw || typeof pw !== 'string') return false
  if (pw.length < 12) return false
  const upper = pw.replace(/[^A-Z]/g, '').length
  const digits = pw.replace(/[^0-9]/g, '').length
  const special = pw.replace(/[A-Za-z0-9]/g, '').length
  if (upper < 2) return false
  if (digits < 2) return false
  if (special < 2) return false
  return true
}
