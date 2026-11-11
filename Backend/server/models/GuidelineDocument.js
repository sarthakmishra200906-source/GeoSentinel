import mongoose from 'mongoose'

const guidelineDocumentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 240 },
    issuingAuthority: { type: String, required: true, trim: true, maxlength: 180 },
    officialUrl: { type: String, required: true, trim: true, maxlength: 1000 },
    publicationDate: { type: Date, default: null },
    reviewDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    effectiveStatus: { type: String, enum: ['pending', 'active', 'expired'], default: 'pending' },
    jurisdiction: { type: String, required: true, trim: true, maxlength: 160 },
    checksum: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'inactive'], default: 'pending' },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    rawText: { type: String, required: true },
    chunks: [
      {
        text: { type: String, required: true },
        section: { type: String, trim: true },
        page: { type: Number, default: null },
      },
    ],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

export default mongoose.model('GuidelineDocument', guidelineDocumentSchema)
