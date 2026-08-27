import assert from 'node:assert/strict'
import test from 'node:test'
import {
  accountingDocumentsMessage,
  accountingDocumentsStatus,
  invoiceShipperDocumentsMessage,
  missingAccountingDocumentLabels,
} from './loadDocuments.js'

const required = [
  {
    id: 'u1',
    name: 'Client Rate Confirmation',
    documentTypes: ['Client Rate Confirmation'],
    source: 'Uploaded',
    storedName: 'rate.pdf',
    defaulted: false,
  },
  {
    id: 'u2',
    name: 'POD scan',
    documentTypes: ['POD'],
    source: 'Uploaded',
    storedName: 'pod.pdf',
    defaulted: false,
  },
  {
    id: 'u3',
    name: 'Signed BOL',
    documentTypes: ['BOL'],
    source: 'Uploaded',
    storedName: 'bol.pdf',
    defaulted: false,
  },
]

test('system generated BOL and rate confirmation do not satisfy accounting docs', () => {
  const generated = [
    {
      key: 'bol',
      name: 'Bill of Lading with Stop Signatures',
      documentTypes: ['BOL'],
      source: 'System Generated',
      defaulted: true,
      storedName: '',
    },
    {
      key: 'rate-confirmation',
      name: 'Rate Confirmation',
      documentTypes: ['Rate Confirmation'],
      source: 'System Generated',
      defaulted: true,
      storedName: '',
    },
  ]
  const missing = missingAccountingDocumentLabels(generated)
  assert.deepEqual(missing, [
    'Client Rate Confirmation',
    'POD (Proof of Delivery)',
    'BOL (Bill of Lading)',
  ])
})

test('uploaded client rate confirmation, POD, and BOL satisfy accounting docs', () => {
  assert.deepEqual(missingAccountingDocumentLabels(required), [])
  assert.equal(accountingDocumentsMessage(required), null)
  const status = accountingDocumentsStatus(required)
  assert.equal(status.every((item) => item.uploaded), true)
})

test('uploaded document with required key is treated as complete', () => {
  const docs = [
    {
      id: 'u1',
      key: 'client-rate-confirmation',
      name: 'Client Rate Confirmation',
      documentTypes: ['Client Rate Confirmation'],
      source: 'Uploaded',
      storedName: 'rate.pdf',
      defaulted: false,
    },
  ]
  const status = accountingDocumentsStatus(docs)
  assert.equal(status.find((item) => item.key === 'client-rate-confirmation')?.uploaded, true)
  assert.equal(status.find((item) => item.key === 'pod')?.uploaded, false)
})

test('message lists only the missing accounting documents', () => {
  const message = accountingDocumentsMessage([required[0]])
  assert.match(String(message), /POD/)
  assert.match(String(message), /BOL/)
  assert.doesNotMatch(String(message), /Client Rate Confirmation/)
})

test('invoice send requires the same uploaded shipper documents', () => {
  const message = invoiceShipperDocumentsMessage(required.slice(0, 2))
  assert.match(String(message), /shipper documents/)
  assert.match(String(message), /BOL/)
  assert.equal(invoiceShipperDocumentsMessage(required), null)
})
