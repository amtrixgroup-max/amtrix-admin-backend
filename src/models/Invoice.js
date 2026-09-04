import mongoose from 'mongoose'

const invoiceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    recordKind: {
      type: String,
      enum: ['ar-ap', 'management'],
      required: true,
      index: true,
    },
    type: { type: String, enum: ['AR', 'AP'] },
    tab: String,
    name: String,
    companyName: String,
    invoiceNumber: String,
    invoiceDate: Date,
    containerNumber: String,
    loadNumber: String,
    reference: String,
    paymentTerms: String,
    dueDate: Date,
    deliveryDate: Date,
    invoiceTotal: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
    balance: Number,
    sentStatus: String,
    qboExportStatus: String,
    pickAddress: String,
    dropAddress: String,
    loadStatus: String,
    lastPaymentReminderAt: Date,
    paymentReminderCount: { type: Number, default: 0 },
  },
  { timestamps: true },
)

invoiceSchema.index({ recordKind: 1, type: 1 })
invoiceSchema.index({ recordKind: 1, tab: 1 })
invoiceSchema.index({ recordKind: 1, type: 1, loadNumber: 1 })

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema)
export default Invoice
