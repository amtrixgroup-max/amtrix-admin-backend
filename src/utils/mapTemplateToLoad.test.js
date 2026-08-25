import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_TEMPLATE_LOAD_CREATION,
  mapTemplateToLoad,
  parseTemplateUseQuantity,
  uniqueLoadId,
} from './mapTemplateToLoad.js'

test('quantity 1 and 20 are allowed', () => {
  assert.equal(parseTemplateUseQuantity(1).quantity, 1)
  assert.equal(parseTemplateUseQuantity(20).quantity, 20)
  assert.equal(parseTemplateUseQuantity('4').quantity, 4)
})

test('quantity 21 and invalid values are rejected', () => {
  assert.equal(parseTemplateUseQuantity(21).code, 'QUANTITY_MAX')
  assert.equal(parseTemplateUseQuantity(0).code, 'QUANTITY_MIN')
  assert.equal(parseTemplateUseQuantity(-2).code, 'QUANTITY_MIN')
  assert.equal(parseTemplateUseQuantity('').code, 'QUANTITY_REQUIRED')
  assert.equal(parseTemplateUseQuantity(1.5).code, 'QUANTITY_INVALID')
  assert.equal(MAX_TEMPLATE_LOAD_CREATION, 20)
})

test('mapTemplateToLoad creates independent nested objects and unique ids', () => {
  const template = {
    id: 'TPL-1',
    templateName: 'Local Reefer',
    customer: 'ABC Logistics',
    branch: 'Shared',
    isShared: true,
    publicNote: 'public',
    privateNote: 'private',
    postingNotes: 'posting',
    stops: [
      { id: 's1', type: 'pickup', location: 'Dallas', actual: 'done' },
      { id: 's2', type: 'delivery', location: 'Houston' },
    ],
    incomeLines: [{ id: 'i1', rate: 100, quantity: 1 }],
    postedAt: new Date(),
    documents: [{ name: 'old' }],
  }

  const first = mapTemplateToLoad(template, { loadId: 'LD-A', index: 0 })
  const second = mapTemplateToLoad(template, { loadId: 'LD-B', index: 1 })

  assert.equal(first.id, 'LD-A')
  assert.equal(second.id, 'LD-B')
  assert.notEqual(first.stops[0].id, second.stops[0].id)
  assert.notEqual(first.incomeLines[0].id, second.incomeLines[0].id)
  first.stops[0].location = 'Changed'
  assert.equal(second.stops[0].location, 'Dallas')
  assert.equal(template.stops[0].location, 'Dallas')
  assert.equal(first.loadStatus, 'Pending')
  assert.equal(first.isDraft, false)
  assert.equal(first.templateName, undefined)
  assert.equal(first.postedAt, null)
  assert.equal(first.documents.length, 0)
  assert.equal(first.stops[0].actual, '')
  assert.equal(first.sourceTemplateId, 'TPL-1')
  assert.equal(first.isShared, true)
  assert.equal(uniqueLoadId(0) === uniqueLoadId(1), false)
})
