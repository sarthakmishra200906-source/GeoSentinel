import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import adminRoutes from './routes/admin.js'
import rescueCenterRoutes from './routes/rescueCenters.js'
import authRoutes from './routes/authRoutes.js'
import chatRoutes from './routes/chatRoutes.js'
import reportsRoutes from './routes/reports.js'
import sosRoutes from './routes/sosRoutes.js'
import weatherRoutes from './routes/weather.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()
const port = Number(process.env.PORT || 5000)
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)
app.use((request, response, next) => {
  const requestId = request.get('x-request-id') || randomUUID()
  request.id = requestId
  response.setHeader('x-request-id', requestId)
  next()
})
app.use(express.json())
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')))

app.get('/api/health', (_request, response) => {
  response.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    weather: process.env.OPENWEATHER_API_KEY ? 'configured' : 'not_configured',
    requestId: response.getHeader('x-request-id'),
  })
})

app.get('/api/ready', (_request, response) => {
  const databaseReady = mongoose.connection.readyState === 1
  const ready = databaseReady && Boolean(process.env.JWT_SECRET)
  response.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    checks: {
      database: databaseReady ? 'connected' : 'disconnected',
      jwt: process.env.JWT_SECRET ? 'configured' : 'not_configured',
    },
    requestId: response.getHeader('x-request-id'),
  })
})
app.use('/api/reports', reportsRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/rescue-centers', rescueCenterRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/sos', sosRoutes)
app.use('/api/weather', weatherRoutes)
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
