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
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      : undefined
  })

  return transporter
}

export async function sendMail({ to, subject, text, html }) {
  const tx = getTransporter()
  if (!tx || !to) {
    if (!tx) {
      console.warn('SMTP is not configured (SMTP_HOST). Skipping email.')
    }
    return { skipped: true }
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@amtrix.local'

  try {
    await tx.sendMail({
      from,
      to,
      subject,
      text,
      html: html || `<p>${String(text || '').replace(/\n/g, '<br/>')}</p>`
    })
    return { sent: true }
  } catch (error) {
    console.error('Failed to send email:', error.message)
    return { sent: false, error: error.message }
  }
}
