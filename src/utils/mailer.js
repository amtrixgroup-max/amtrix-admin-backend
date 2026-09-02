import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  const host = process.env.SMTP_HOST
  if (!host) return null

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: String(process.env.SMTP_USER).trim(),
          pass: String(process.env.SMTP_PASS || '').replace(/\s+/g, ''),
        }
      : undefined
  })

  return transporter
}

export async function sendMail({ to, subject, text, html, attachments, fromName }) {
  const tx = getTransporter()
  const recipients = Array.isArray(to)
    ? to.map((item) => String(item || '').trim()).filter(Boolean).join(', ')
    : String(to || '').trim()
  if (!tx || !recipients) {
    if (!tx) {
      console.warn('SMTP is not configured (SMTP_HOST). Skipping email.')
    }
    return { skipped: true, message: !recipients ? 'Recipient email is required' : 'Email is not configured on the server.' }
  }

  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@amtrix.local'
  const safeName = String(fromName || '').replace(/["<>]/g, '').trim()
  const from = safeName ? `"${safeName}" <${fromEmail}>` : fromEmail

  try {
    await tx.sendMail({
      from,
      to: recipients,
      subject,
      text,
      html: html || `<p>${String(text || '').replace(/\n/g, '<br/>')}</p>`,
      attachments: attachments || [],
    })
    return { sent: true }
  } catch (error) {
    console.error('Failed to send email:', error.message)
    return { sent: false, error: error.message }
  }
}
