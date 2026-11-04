import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import adminRoutes from './routes/admin.js'
import authRoutes from './routes/authRoutes.js'
import chatRoutes from './routes/chatRoutes.js'
import reportsRoutes from './routes/reports.js'
import sosRoutes from './routes/sosRoutes.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()
const port = Number(process.env.PORT || 5000)

app.use(cors())
app.use(express.json())

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  })
})
app.use('/api/reports', reportsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/sos', sosRoutes)
app.use(notFoundHandler)
app.use(errorHandler)

async function startServer() {
  if (process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'resq_ai_db',
    })
    console.log('Connected to MongoDB')
  } else {
    console.warn('MONGO_URI is not configured; database routes will not be available')
  }

  app.listen(port, () => {
    console.log(`Resq-AI server listening on port ${port}`)
  })
}

startServer().catch((error) => {
  console.error('Unable to start server', error)
  process.exitCode = 1
})
