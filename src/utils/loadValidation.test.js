import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_DECLARED_LOAD_VALUE,
  declaredValueError,
  palletCountError,
  validateLoadDraft,
} from './loadValidation.js'

test('declared load value cannot exceed 1 lakh', () => {
  assert.equal(declaredValueError({ declaredValue: 100000 }), null)
  assert.equal(declaredValueError({ declaredValue: '99999' }), null)
  assert.match(String(declaredValueError({ declaredValue: 100001 })), /1 lakh/)
  assert.match(String(declaredValueError({ declaredValue: 150000 })), /1 lakh/)
  assert.equal(MAX_DECLARED_LOAD_VALUE, 100000)
})

test('no of pallets is required only for partial loads', () => {
  assert.equal(palletCountError({ loadSize: 'full' }), null)
  assert.equal(palletCountError({ loadSize: 'full', quantity: '' }), null)
  assert.match(String(palletCountError({ loadSize: 'partial' })), /required/)
  assert.match(String(palletCountError({ loadSize: 'partial', quantity: '' })), /required/)
  assert.match(String(palletCountError({ loadSize: 'partial', palletCount: 0 })), /at least 1/)
  assert.equal(palletCountError({ loadSize: 'partial', palletCount: 4 }), null)
})

test('validateLoadDraft applies both rules', () => {
  const overValue = validateLoadDraft({ declaredValue: 200000, loadSize: 'full' })
  assert.ok(overValue.declaredValue)
  const missingPallets = validateLoadDraft({ loadSize: 'partial', declaredValue: 50000 })
  assert.ok(missingPallets.quantity)
  const ok = validateLoadDraft({ loadSize: 'partial', palletCount: 2, declaredValue: 50000 })
  assert.deepEqual(ok, {})
})
