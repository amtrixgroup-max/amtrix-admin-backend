import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dashboardAgingRange,
  daysPastDue,
  daysUntilDue,
  parsePaymentTermDays,
  shouldSendPaymentReminder,
} from './invoiceAging.js'

test('parsePaymentTermDays reads Net terms and due-on-receipt', () => {
  assert.equal(parsePaymentTermDays('Net 30'), 30)
  assert.equal(parsePaymentTermDays('Net 15'), 15)
  assert.equal(parsePaymentTermDays('Due on Receipt'), 0)
  assert.equal(parsePaymentTermDays('Prepaid'), 0)
  assert.equal(parsePaymentTermDays(''), 30)
})

test('daysPastDue and daysUntilDue use calendar days', () => {
  const now = new Date('2026-09-04T15:00:00Z')
  assert.equal(daysPastDue('2026-08-05', now), 30)
  assert.equal(daysUntilDue('2026-09-14', now), 10)
  assert.equal(daysUntilDue('2026-09-04', now), 0)
})

test('dashboardAgingRange maps overdue days into list buckets', () => {
  assert.equal(dashboardAgingRange(0), 'd0to30')
  assert.equal(dashboardAgingRange(30), 'd0to30')
  assert.equal(dashboardAgingRange(31), 'd31to60')
  assert.equal(dashboardAgingRange(90), 'd61to90')
  assert.equal(dashboardAgingRange(91), 'd90plus')
})

test('shouldSendPaymentReminder waits until the due date then every 24 hours', () => {
  const now = new Date('2026-09-04T12:00:00Z')
  const open = {
    invoiceTotal: 1000,
    paid: 0,
    balance: 1000,
    dueDate: '2026-08-04',
  }
  assert.equal(shouldSendPaymentReminder(open, now), true)
  assert.equal(shouldSendPaymentReminder({ ...open, dueDate: '2026-09-10' }, now), false)
  assert.equal(
    shouldSendPaymentReminder(
      { ...open, lastPaymentReminderAt: '2026-09-04T01:00:00Z' },
      now,
    ),
    false,
  )
  assert.equal(
    shouldSendPaymentReminder(
      { ...open, lastPaymentReminderAt: '2026-09-03T11:00:00Z' },
      now,
    ),
    true,
  )
  assert.equal(shouldSendPaymentReminder({ ...open, balance: 0 }, now), false)
  assert.equal(shouldSendPaymentReminder({ ...open, sentStatus: 'Factored' }, now), false)
})
